import type { LedgerState } from '../domain/types';
import { LEDGER_FILE, LEDGER_FILE_V1, parseLedgerFile, serialiseLedgerFile } from './ledgerFile';
import type { RemoteSnapshot, RemoteStore } from './syncEngine';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when re-authorising and retrying is likely to help. */
    readonly authExpired: boolean
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

/** Drive query strings are single-quoted, so quotes and backslashes must be escaped. */
const escapeQueryValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const request = async (url: string, token: string, init: RequestInit = {}): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
    });
  } catch {
    // fetch only rejects on network failure, which is the offline case.
    throw new DriveError('No connection to Google Drive.', 0, false);
  }

  if (response.ok) return response;

  const body = await response.text().catch(() => '');
  const authExpired = response.status === 401 || response.status === 403;
  throw new DriveError(
    `Drive request failed (${response.status})${body.length > 0 ? `: ${body.slice(0, 200)}` : ''}`,
    response.status,
    authExpired
  );
};

export interface DriveFileRef {
  id: string;
  modifiedTime: string | undefined;
}

export const findFile = async (token: string, name: string): Promise<DriveFileRef | null> => {
  const query = encodeURIComponent(`name = '${escapeQueryValue(name)}' and trashed = false`);
  const response = await request(
    `${DRIVE_API}/files?q=${query}&fields=files(id,name,modifiedTime)&spaces=drive&orderBy=modifiedTime desc`,
    token
  );
  const data = (await response.json()) as { files?: Array<{ id: string; modifiedTime?: string }> };
  const first = data.files?.[0];
  return first == null ? null : { id: first.id, modifiedTime: first.modifiedTime };
};

export const readFile = async (token: string, fileId: string): Promise<unknown> => {
  const response = await request(`${DRIVE_API}/files/${fileId}?alt=media`, token);
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DriveError('The Drive backup is not valid JSON.', 200, false);
  }
};

const multipartBody = (metadata: object, content: string, boundary: string): string =>
  [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
    ''
  ].join('\r\n');

export const writeFile = async (
  token: string,
  fileId: string | null,
  name: string,
  payload: unknown
): Promise<DriveFileRef> => {
  const boundary = `moneymap-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const metadata = fileId == null ? { name, mimeType: 'application/json' } : { name };
  const body = multipartBody(metadata, JSON.stringify(payload), boundary);

  const url =
    fileId == null
      ? `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`
      : `${DRIVE_UPLOAD}/files/${fileId}?uploadType=multipart&fields=id,modifiedTime`;

  const response = await request(url, token, {
    method: fileId == null ? 'POST' : 'PATCH',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });

  const saved = (await response.json()) as { id: string; modifiedTime?: string };
  return { id: saved.id, modifiedTime: saved.modifiedTime };
};

export interface DriveRemoteOptions {
  /** Supplies a token; `interactive: false` means "do not prompt". */
  getToken: (options: { interactive: boolean }) => Promise<string>;
  /** Called when the backup's file id is first discovered or created. */
  onFileId?: (fileId: string | null) => void;
  /** Cached id from a previous session, to skip the lookup. */
  fileId?: string | null;
}

/**
 * Adapts Drive to the `RemoteStore` interface the sync engine works against.
 *
 * Writes go only to `money-map-data-v3.json`. The v1 file is never modified, so
 * money-map v1 keeps running untouched on both phones for as long as it stays
 * installed.
 */
export const createDriveRemote = (options: DriveRemoteOptions): RemoteStore => {
  let fileId = options.fileId ?? null;

  const token = () => options.getToken({ interactive: false });

  const resolveFileId = async (accessToken: string): Promise<string | null> => {
    if (fileId != null) return fileId;
    const found = await findFile(accessToken, LEDGER_FILE);
    fileId = found?.id ?? null;
    options.onFileId?.(fileId);
    return fileId;
  };

  return {
    read: async (): Promise<RemoteSnapshot> => {
      const accessToken = await token();
      const id = await resolveFileId(accessToken);

      if (id == null) {
        return { state: { entries: [], tombstones: [] }, syncedAt: null, exists: false };
      }

      try {
        const parsed = parseLedgerFile(await readFile(accessToken, id));
        return { state: parsed.state, syncedAt: parsed.syncedAt, exists: true };
      } catch (error) {
        // The backup was deleted or trashed from Drive directly. Forget the id
        // so the next pass re-discovers or recreates it, rather than failing
        // forever against a file that no longer exists.
        if (error instanceof DriveError && error.status === 404) {
          fileId = null;
          options.onFileId?.(null);
          return { state: { entries: [], tombstones: [] }, syncedAt: null, exists: false };
        }
        throw error;
      }
    },

    write: async (state: LedgerState, syncedAt: string): Promise<void> => {
      const accessToken = await token();
      const id = await resolveFileId(accessToken);
      const saved = await writeFile(accessToken, id, LEDGER_FILE, serialiseLedgerFile(state, syncedAt));

      if (fileId !== saved.id) {
        fileId = saved.id;
        options.onFileId?.(fileId);
      }
    }
  };
};

/**
 * One-time read of the money-map v1 backup, for the initial import.
 * Read-only by construction — nothing here can write to the v1 file.
 */
export const readLegacyBackup = async (token: string) => {
  const found = await findFile(token, LEDGER_FILE_V1);
  if (found == null) return null;
  return parseLedgerFile(await readFile(token, found.id));
};

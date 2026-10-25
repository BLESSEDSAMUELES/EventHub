export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface SystemLogEntry {
  id: string;
  tenant_id: string | null;
  level: LogLevel;
  message: string;
  metadata?: any;
  created_at: string;
}

// In-memory audit log buffer for fast access and fallback
export const inMemoryAuditLogs: SystemLogEntry[] = [];

export const logger = {
  info: (message: string, metadata?: any, tenant_id?: string | null) => {
    const timestamp = new Date().toISOString();
    console.log(`[INFO] [${timestamp}] ${message}`, metadata ? JSON.stringify(metadata) : '');
    inMemoryAuditLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenant_id || null,
      level: 'INFO',
      message,
      metadata,
      created_at: timestamp,
    });
    if (inMemoryAuditLogs.length > 200) inMemoryAuditLogs.pop();
  },
  warn: (message: string, metadata?: any, tenant_id?: string | null) => {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN] [${timestamp}] ${message}`, metadata ? JSON.stringify(metadata) : '');
    inMemoryAuditLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenant_id || null,
      level: 'WARN',
      message,
      metadata,
      created_at: timestamp,
    });
    if (inMemoryAuditLogs.length > 200) inMemoryAuditLogs.pop();
  },
  error: (message: string, metadata?: any, tenant_id?: string | null) => {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] [${timestamp}] ${message}`, metadata ? JSON.stringify(metadata) : '');
    inMemoryAuditLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenant_id || null,
      level: 'ERROR',
      message,
      metadata,
      created_at: timestamp,
    });
    if (inMemoryAuditLogs.length > 200) inMemoryAuditLogs.pop();
  },
};

import { contextBridge, ipcRenderer } from 'electron';

// Typed, minimal, allow-listed API. No raw Node access exposed to renderer.
const api = {
  list: (table: string, orderBy?: string, limit?: number) =>
    ipcRenderer.invoke('lifeos:list', table, orderBy, limit),
  get: (table: string, id: number) => ipcRenderer.invoke('lifeos:get', table, id),
  create: (table: string, data: Record<string, unknown>) =>
    ipcRenderer.invoke('lifeos:create', table, data),
  update: (table: string, id: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke('lifeos:update', table, id, data),
  remove: (table: string, id: number) => ipcRenderer.invoke('lifeos:remove', table, id),
  search: (term: string) => ipcRenderer.invoke('lifeos:search', term),
  openExternal: (url: string) => ipcRenderer.invoke('lifeos:open-external', url),
  exportData: () => ipcRenderer.invoke('lifeos:export'),
  backup: () => ipcRenderer.invoke('lifeos:backup'),
  restore: () => ipcRenderer.invoke('lifeos:restore'),
  dbPath: () => ipcRenderer.invoke('lifeos:dbpath'),
  settingGet: (key: string) => ipcRenderer.invoke('lifeos:setting:get', key),
  settingSet: (key: string, value: string) => ipcRenderer.invoke('lifeos:setting:set', key, value),
  settingsAll: () => ipcRenderer.invoke('lifeos:settings:all')
};

export type LifeosApi = typeof api;

contextBridge.exposeInMainWorld('lifeos', api);

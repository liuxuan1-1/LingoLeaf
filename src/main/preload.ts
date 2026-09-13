import { contextBridge, ipcRenderer } from 'electron';
import type { LingoAPI, ResultEvent } from '../shared/types';
const api: LingoAPI = {
  getState: () => ipcRenderer.invoke('state:get'),
  analyze: (text, mode) => ipcRenderer.invoke('analyze', { text, mode }),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  testProvider: settings => ipcRenderer.invoke('provider:test', settings),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  openLibrary: () => ipcRenderer.invoke('library:open'),
  review: (id, rating) => ipcRenderer.invoke('entry:review', { id, rating }),
  deleteEntry: id => ipcRenderer.invoke('entry:delete', id),
  copy: text => ipcRenderer.invoke('clipboard:copy', text),
  replace: () => ipcRenderer.invoke('selection:replace'),
  mobileStart: () => ipcRenderer.invoke('mobile:start'),
  mobileStop: () => ipcRenderer.invoke('mobile:stop'),
  mobileStatus: () => ipcRenderer.invoke('mobile:status'),
  exportLibrary: () => ipcRenderer.invoke('library:export'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openMain: () => ipcRenderer.send('window:main'),
  onResult: callback => {
    const listener = (_event: Electron.IpcRendererEvent, result: ResultEvent) => callback(result);
    ipcRenderer.on('result', listener);
    let disposed = false;
    void ipcRenderer.invoke('result:get').then(result => { if (result && !disposed) callback(result); });
    return () => { disposed = true; ipcRenderer.removeListener('result', listener); };
  },
  onChanged: callback => {
    const listener = () => callback(); ipcRenderer.on('changed', listener);
    return () => { ipcRenderer.removeListener('changed', listener); };
  },
};
contextBridge.exposeInMainWorld('lingo', api);

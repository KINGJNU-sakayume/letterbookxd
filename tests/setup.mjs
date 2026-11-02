// 브라우저 대신: IndexedDB는 fake-indexeddb, window는 globalThis (toast의 setTimeout용)
import 'fake-indexeddb/auto';
globalThis.window ??= globalThis;

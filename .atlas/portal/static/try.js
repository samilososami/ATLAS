import {session, logout} from './api.js';
await session();
document.querySelector('#screen').src = '/try/screen/';
document.querySelector('#logout').addEventListener('click', logout);

'use strict';

const url = require('url');
const path = require('path');

const electron = require('electron');
const {app, BrowserWindow, ipcMain} = electron;

const core = require('./core.js');
const {Library, Settings, Song} = core;

const settings = new Settings();

const library = new Library(settings.settings['musicDirectory']);
let mainWindow;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        minWidth: 1200,
        minHeight: 600,
        center: true,
        icon: path.join(__dirname, 'icons', 'png', '64x64.png')
    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'views', 'index.html'),
        protocol: 'file:',
        slashes: true
    }));

    mainWindow.on('closed', () => {
        app.quit();
    });

    mainWindow.webContents.once('dom-ready', () => {
        if (library.songs.length > 0) {
            let result = library.getByField(settings.settings['defaultView']);
            mainWindow.webContents.send('finderResult', result);
            mainWindow.webContents.send('initGroupingOption', settings.settings['defaultView']);
        }
    });
});

ipcMain.on('scanLibrary', (event, arg) => {
    library.scan(() => {
        library.save();
        let result = library.getByField(arg) || [];
        event.sender.send('finderResult', result);
    });
});

ipcMain.on('getByField', (event, arg) => {
    let result = library.getByField(arg) || [];
    event.sender.send('finderResult', result);
});

ipcMain.on('searchByField', (event, arg) => {
    let result = library.searchByField(arg['field'], arg['searchPhrase'],
                                        settings.settings['searchIgnoreCase'],
                                        settings.settings['partialSearch']) || [];
    event.sender.send('searchResult', result);
});

ipcMain.on('getSongPath', (event, arg) => {
    let result = library.getFilepath(arg['artist'], arg['title']) || [];
    event.sender.send('getSongPathResult', result);
});

ipcMain.on('getSearchIgnoreCase', (event, arg) => {
    let result = settings.settings['searchIgnoreCase'];
    event.sender.send('searchIgnoreCaseResult', result);
});

ipcMain.on('getSongsBy', (event, arg) => {
    let result = library.getSongsBy(arg['field'], arg['value']) || [];
    event.sender.send('listSongsResult', result);
});

ipcMain.on('getSong', (event, arg) => {
    let result = library.getSong(arg) || [];
    event.sender.send('getSongResult', result);
});

ipcMain.on('getSettings', (event, arg) => {
    event.sender.send('getSettingsResult', {'settings': settings.settings, 'schema': settings.schema});
});

ipcMain.on('setSettings', (event, arg) => {
    let result = settings.validate(arg);
    if (result[0]) {
        settings.settings = arg;
        settings.save();
    }
    event.sender.send('setSettingsResult', result[1]);
});
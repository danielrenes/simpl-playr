'use strict';

const fs = require('fs');
const path = require('path');

const fuzzysearch = require('fuzzysearch');
const musicMetadata = require('music-metadata');

const userHomeDirectory = require('os').homedir();
const appDataDirectory =  path.join(userHomeDirectory, '.simplplayr');
const settingsPath = path.join(appDataDirectory, 'settings.json');
const libraryPath = path.join(appDataDirectory, 'library.json');
const savedPlaylistPath = path.join(appDataDirectory, 'playlist.json');

function Song(filepath, filename) {
    this.filepath = filepath;
    this.filename = filename;
    this.artist = '';
    this.title = '';
    this.album = '';
    this.genre = '';
}

function listDirectory(directoryPath) {
    let dir = {
        'files': [],
        'directories': []
    };

    let files = fs.readdirSync(directoryPath);

    for (let i = 0; i < files.length; i++) {
        let filename = files[i];
        let filepath = path.join(directoryPath, filename);
        let stats = fs.statSync(filepath);

        if (stats.isDirectory()) {
            dir['directories'].push(filepath);
        } else {
            dir['files'].push(new Song(filepath, filename));
        }
    }

    return dir;
}

function listDirectories(directories) {
    let dir = {
        'files': [],
        'directories': []
    };

    for (let i = 0; i < directories.length; i++) {
        let directoryPath = directories[i];
        let currentDir = listDirectory(directoryPath);
        dir['files'] = dir['files'].concat(currentDir['files']);
        dir['directories'] = dir['directories'].concat(currentDir['directories']);
    }

    return dir;
}

function Settings() {
    const defaultViewEnum = {
        'artist': 0,
        'album': 1,
        'genre': 2,
        'title': 3
    };

    this.schema = {
        'musicDirectory': 'string',
        'defaultView': defaultViewEnum,
        'searchIgnoreCase': 'boolean',
        'partialSearch': 'boolean',
        'seekTime': 'number',
        'savePlaylist': 'boolean'
    };

    const defaultSettings = {
        'musicDirectory': path.join(userHomeDirectory, 'Music'),
        'defaultView': 'artist',
        'searchIgnoreCase': true,
        'partialSearch': true,
        'seekTime': 10,
        'savePlaylist': false
    };

    this.save = function() {
        if (!fs.existsSync(appDataDirectory)) {
            fs.mkdirSync(appDataDirectory);
        }
        fs.writeFileSync(settingsPath, JSON.stringify(this.settings));
    }

    this.load = function() {
        if (!fs.existsSync(settingsPath)) {
            return undefined;
        }
        let settings = JSON.parse(fs.readFileSync(settingsPath));
        return settings;
    }

    this.settings = this.load() || defaultSettings;

    this.validate = function(settingsCandidate) {
        for (let key in settingsCandidate) {
            let setting = settingsCandidate[key];
            let type = this.schema[key];

            if (typeof type === 'string') {
                if (typeof setting !== type) {
                    return [false, 'Type of ' + key + ' is incorrect'];
                }
            } else {
                let isValid = false;

                for (let option in type) {
                    if (setting === option) {
                        isValid = true;
                        break;
                    }
                }

                if (!isValid) {
                    return [false, 'Value of ' + key + ' is incorrect'];
                }
            }
        }

        return [true, ''];
    }
}

function Library(musicDirectoryPath) {
    this.musicDirectoryPath = musicDirectoryPath;

    let parseMetadata = function(song, callback) {
        musicMetadata
            .parseFile(song.filepath, {native: true})
            .then(function (metadata) {
                let songInfo = metadata['common'];

                song.artist = (typeof songInfo['artist'] !== 'undefined') ? songInfo['artist'] : 'Unknown';
                song.title = (typeof songInfo['title'] !== 'undefined') ? songInfo['title'] : 'Unknown';
                song.album = (typeof songInfo['album'] !== 'undefined') ? songInfo['album'] : 'Unknown';
                song.genre = ((typeof songInfo['genre'] !== 'undefined') &&
                                (songInfo['genre'].length > 0)) ? songInfo['genre'][0] : 'Unknown';
                callback(song);
            })
            .catch(function (err) {
                console.error(err.message);
            });
    }

    this.scan = function(callback) {
        let lastLevelDir = listDirectory(this.musicDirectoryPath);
        let songs = lastLevelDir['files'];
        let hasDirectory = (lastLevelDir['directories'].length > 0);
    
        while (hasDirectory) {
            lastLevelDir = listDirectories(lastLevelDir['directories'])
            songs = songs.concat(lastLevelDir['files']);
            hasDirectory = (lastLevelDir['directories'].length > 0);
        }

        this.songs = [];

        let index = 0;

        const cb = (song) => {
            this.songs.push(song);
            let hasNext = (index !== (songs.length - 1));
            if (hasNext) {
                parseMetadata(songs[++index], cb);
            } else {
                callback();
            }
        };

        parseMetadata(songs[index], cb);
    }

    let uniqueFilter = function(value, index, self) {
        return self.indexOf(value) === index;
    }

    this.getByField = function(field) {
        if ((field !== 'artist') && (field !== 'album') && (field !== 'genre') && (field !== 'title')) {
            return undefined;
        }

        let result = [];
        for (let i = 0; i < this.songs.length; i++) {
            result.push(this.songs[i][field]);
        }

        return result.filter(uniqueFilter);
    }

    this.getSongsBy = function(field, value) {
        if ((field !== 'artist') && (field !== 'album') && (field !== 'genre')) {
            return undefined;
        }

        let result = [];

        for (let i = 0; i < this.songs.length; i++) {
            let song = this.songs[i];

            if (song[field] === value) {
                result.push(song);
            }
        }

        return result;
    }

    this.getSong = function(title) {
        for (let i = 0; i < this.songs.length; i++) {
            let song = this.songs[i];

            if (song['title'] === title) {
                return song;
            }
        }

        return undefined;
    }

    this.getFilepath = function(artist, title) {
        for (let i in this.songs) {
            let song = this.songs[i];

            if (song['artist'] === artist && song['title'] === title) {
                return song['filepath'];
            }
        }

        return undefined;
    }

    this.searchByField = function(field, searchPhrase, ignoreCase, partialSearch) {
        if ((field !== 'artist') && (field !== 'album') && (field !== 'genre') && (field !== 'title')) {
            return undefined;
        }

        if (ignoreCase) {
            searchPhrase = searchPhrase.toLowerCase();
        }

        let result = [];

        for (let i in this.songs) {
            let song = this.songs[i];
            let fieldValue = song[field];

            if (ignoreCase) {
                fieldValue = fieldValue.toLowerCase();
            }

            if (partialSearch) {
                if (fuzzysearch(searchPhrase, fieldValue)) {
                    result.push(song[field]);
                }
            } else {
                if (fieldValue === searchPhrase) {
                    result.push(song[field]);
                    break;
                }
            }
        }

        return result.filter(uniqueFilter);
    }

    this.save = function() {
        if (!fs.existsSync(appDataDirectory)) {
            fs.mkdirSync(appDataDirectory);
        }
        fs.writeFileSync(libraryPath, JSON.stringify(this.songs));
    }

    this.load = function() {
        if (!fs.existsSync(libraryPath)) {
            console.log('library is not found');
            return undefined;
        }
        let songs = JSON.parse(fs.readFileSync(libraryPath));
        return songs;
    }

    this.songs = this.load() || [];
}

function Playlist() {
    this.load = function(savePlaylist, library) {
        if (!savePlaylist) {
            return [];
        } else {
            if (!fs.existsSync(savedPlaylistPath)) {
                console.log('saved playlist is not found');
                return [];
            }
            let playlist = JSON.parse(fs.readFileSync(savedPlaylistPath));
            for (let i = 0; i < playlist.length; i++) {
                let playlistItem = playlist[i];
                let foundInLibrary = false;

                for (let j = 0; j < library.songs.length; j++) {
                    let song = library.songs[j];
                    if ((playlistItem.artist === song.artist) &&
                            (playlistItem.album === song.album) &&
                            (playlistItem.genre === song.genre) &&
                            (playlistItem.title === song.title)) {
                        foundInLibrary = true;
                        break;
                    }
                }

                if (!foundInLibrary) {
                    console.log('could not find song (' + playlistItem.artist +
                                                    ', ' + playlistItem.album +
                                                    ', ' + playlistItem.genre +
                                                    ', ' + playlistItem.title + ') in library');
                    return [];
                }
            }
            return playlist;
        }
    }

    this.save = function(savePlaylist, playlist) {
        if (!savePlaylist) {
            return;
        } else {
            if (!fs.existsSync(appDataDirectory)) {
                fs.mkdirSync(appDataDirectory);
            }
            fs.writeFileSync(savedPlaylistPath, JSON.stringify(playlist));
        }
    }
}

module.exports.Song = Song;
module.exports.Settings = Settings;
module.exports.Library = Library;
module.exports.Playlist = Playlist;
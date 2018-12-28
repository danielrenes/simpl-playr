'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const fuzzysearch = require('fuzzysearch');
const musicMetadata = require('music-metadata');
const Discogs = require('disconnect').Client;
const discogsDatabase = new Discogs({userToken: process.env.DISCOGS_API_KEY}).database();

const userHomeDirectory = require('os').homedir();
const appDataDirectory =  path.join(userHomeDirectory, '.simplplayr');
const settingsPath = path.join(appDataDirectory, 'settings.json');
const libraryPath = path.join(appDataDirectory, 'library.json');
const savedPlaylistPath = path.join(appDataDirectory, 'playlist.json');

let findCoverArt = function(artist, album, cb) {
    discogsDatabase.search({artist: artist, album: album}).then((res, err) => {
        if (typeof err === 'undefined' && res.hasOwnProperty('results')) {
            let image_links = []

            // try to get images that match both the artist and the album
            for (let i = 0; i < res.results.length; i++) {
                if (res.results[i].title.indexOf(artist) > -1 &&
                        res.results[i].title.indexOf(album) > -1 &&
                        typeof res.results[i].cover_image !== 'undefined') {
                    image_links.push(res.results[i].cover_image);
                }
            }

            if (image_links.length === 0) {
                // try to get images that only match the artist
                for (let i = 0; i < res.results.length; i++) {
                    if (res.results[i].title.indexOf(artist) > -1 &&
                            typeof res.results[i].cover_image !== 'undefined') {
                        image_links.push(res.results[i].cover_image);
                    }
                }
            }

            if (image_links.length === 0) {
                image_links = undefined;
            }

            cb(image_links);
        } else {
            cb(undefined);
        }
    });
}

function Song(filepath, filename) {
    this.filepath = filepath;
    this.filename = filename;
    this.artist = '';
    this.title = '';
    this.album = '';
    this.genre = '';
    this.duration = '';
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
        'savePlaylist': 'boolean',
        'loadCoverArt': 'boolean'
    };

    const defaultSettings = {
        'musicDirectory': path.join(userHomeDirectory, 'Music'),
        'defaultView': 'artist',
        'searchIgnoreCase': true,
        'partialSearch': true,
        'seekTime': 10,
        'savePlaylist': false,
        'loadCoverArt': false
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
                song.artist = (typeof metadata.common.artist !== 'undefined') ? metadata.common.artist : 'Unknown';
                song.title = (typeof metadata.common.title !== 'undefined') ? metadata.common.title : 'Unknown';
                song.album = (typeof metadata.common.album !== 'undefined') ? metadata.common.album : 'Unknown';
                song.genre = ((typeof metadata.common.genre !== 'undefined') &&
                                (metadata.common.genre.length > 0)) ? metadata.common.genre[0] : 'Unknown';
                song.duration = (typeof metadata.format.duration !== 'undefined') ? metadata.format.duration : 'Unknown';
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
module.exports.findCoverArt = findCoverArt;
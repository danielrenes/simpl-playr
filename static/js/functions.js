'use strict';

const path = require('path');

const ejs = require('ejs');
const electron = require('electron');
const { ipcRenderer } = electron;

const KeyCode = {
    'ARROW_DOWN': 40,
    'ARROW_LEFT': 37,
    'ARROW_UP': 38,
    'ARROW_RIGHT': 39,
    'DELETE': 46,
    'ENTER': 13,
    'SPACE': 32
}

let settings;

let playlistItems = [];

let coverArtHolder;
let finderTarget;
let groupingOptions;
let modalTarget;
let playlistHeaderLastColumn;
let playlistTable;
let playlist;
let searchBackButton;
let searchForm;
let searchMessage;

(function ($) {
    ipcRenderer.send('getSettings', {'render': false});
    ipcRenderer.send('getSavedPlaylist');
})(jQuery)

$(document).ready(() => {
    coverArtHolder = $('#cover-art-holder');
    finderTarget = $('#finder-content');
    groupingOptions = $('.groupingOption');
    modalTarget = $('#modal-target');
    playlistHeaderLastColumn = $('#playlist > table:first-child > thead > tr > th:last-child > div');
    playlistTable = $('#playlist > table.is-scrollable');
    playlist = $('#playlist > table.is-scrollable > tbody');
    searchBackButton = $('#search-back');
    searchForm = $('#search-form');
    searchMessage = $("#search-message");

    let audio;

    let clearPlaylist = $('#clear-playlist');

    let songCurrentTime = $("#song-current-time");
    let songDuration = $("#song-duration");

    let playPauseButton = $('#control-play-pause');
    let previousButton = $('#control-prev');
    let nextButton = $('#control-next');

    let progressBar = $("#progress-bar");

    let scanButton = $('#scan');

    let searchInput = $('#search-input');
    let searchSubmit = $('#search-submit');

    let settingsButton = $('#settings');

    $(document).keydown((e) => {
        const playlistSize = $('.playlist-item').length;

        if (e.keyCode === KeyCode.ARROW_UP || e.keyCode === KeyCode.ARROW_DOWN) {
            let currentIndex;

            $('.playlist-item').each((index, element) => {
                if ($(element).hasClass('has-cursor')) {
                    currentIndex = index;
                }
            });

            if (typeof currentIndex === 'undefined') {
                $('.playlist-item').each((index, element) => {
                    if ($(element).hasClass('is-loaded')) {
                        currentIndex = index;
                    }
                });
            }

            if (typeof currentIndex !== 'undefined') {
                if (e.keyCode === KeyCode.ARROW_UP) {
                    if ((currentIndex - 1) <= 0) {
                        $('.playlist-item').each((index, element) => {
                            if (index === 0) {
                                $(element).addClass('has-cursor');
                            } else {
                                $(element).removeClass('has-cursor');
                            }
                        });
                    } else {
                        $('.playlist-item').each((index, element) => {
                            if (index === (currentIndex - 1)) {
                                $(element).addClass('has-cursor');
                            } else {
                                $(element).removeClass('has-cursor');
                            }
                        });
                    }
                } else if (e.keyCode === KeyCode.ARROW_DOWN) {
                    if ((currentIndex + 1) >= (playlistSize - 1)) {
                        $('.playlist-item').each((index, element) => {
                            if (index === (playlistSize - 1)) {
                                $(element).addClass('has-cursor');
                            } else {
                                $(element).removeClass('has-cursor');
                            }
                        });
                    } else {
                        $('.playlist-item').each((index, element) => {
                            if (index === (currentIndex + 1)) {
                                $(element).addClass('has-cursor');
                            } else {
                                $(element).removeClass('has-cursor');
                            }
                        });
                    }
                }
            } else {
                if (playlistSize > 0) {
                    currentIndex = 0;

                    $('.playlist-item').each((index, element) => {
                        if (index === currentIndex) {
                            $(element).addClass('has-cursor');
                        } else {
                            $(element).removeClass('has-cursor');
                        }
                    });
                }
            }

            e.preventDefault();
        } else if (e.keyCode === KeyCode.SPACE) {
            let currentItem;
            $('.playlist-item').each((index, element) => {
                if ($(element).hasClass('has-cursor')) {
                    currentItem = element;
                }
            });

            if (typeof currentItem !== 'undefined') {
                if ($(currentItem).closest('tr').hasClass('is-loaded')) {
                    if (typeof audio !== 'undefined') {
                        if (audio.paused) {
                            audio.play();
                            playPauseButton.find('span > i').removeClass('fa-play').addClass('fa-pause');
                        } else {
                            audio.pause();
                            playPauseButton.find('span > i').removeClass('fa-pause').addClass('fa-play');
                        }
                    }
                } else {
                    playItem(currentItem);
                }
            }

            e.preventDefault();
        } else if (e.keyCode === KeyCode.DELETE) {
            let currentItem;
            let currentIndex;
            $('.playlist-item').each((index, element) => {
                if ($(element).hasClass('has-cursor')) {
                    currentItem = element;
                    currentIndex = index;
                }
            });

            if ($(currentItem).closest('tr').hasClass('is-loaded')) {
                if (typeof audio !== 'undefined') {
                    audio.pause();
                    audio.removeEventListener('ended', audioEndedListener);
                    audio.removeEventListener('timeupdate', audioTimeUpdateListener);
                    audio = undefined;
                    playPauseButton.find('span > i').removeClass('fa-pause').addClass('fa-play');
                    progressBar.val(0);
                }
            }

            $(currentItem).closest('tr').remove();
            playlistItems.splice(currentIndex, 1);
            adjustPlaylistHeaderOffset();

            e.preventDefault();
        } else if (e.keyCode === KeyCode.ARROW_LEFT || e.keyCode === KeyCode.ARROW_RIGHT) {
            if (typeof audio !== 'undefined') {
                if (e.keyCode === KeyCode.ARROW_LEFT) {
                    audio.currentTime -= settings.seekTime;
                } else if (e.keyCode === KeyCode.ARROW_RIGHT) {
                    audio.currentTime += settings.seekTime;
                }
            }

            e.preventDefault();
        }
    });

    clearPlaylist.click((e) => {
        $('.playlist-item').each((index, element) => {
            $(element).closest('tr').remove();
        });

        playlistItems.splice(0, playlistItems.length);
    });

    groupingOptions.click((e) => {
        $(searchBackButton).css('visibility', 'hidden');
        $(searchMessage).css('visibility', 'hidden');
        $(searchForm).css('visibility', 'visible').hide().fadeIn(750);

        groupingOptions.each((index, element) => {
            $(element).removeClass('is-active');
        });
        let li = $(e.target).closest('li');
        $(li).addClass('is-active');
        let groupingOption = $(li).find('a > span').text().toLowerCase();
        ipcRenderer.send('getByField', groupingOption);
    });

    playPauseButton.click(() => {
        if (typeof audio !== 'undefined') {
            if (audio.paused) {
                audio.play();
                playPauseButton.find('span > i').removeClass('fa-play').addClass('fa-pause');
            } else {
                audio.pause();
                playPauseButton.find('span > i').removeClass('fa-pause').addClass('fa-play');
            }
        } else {
            let firstPlaylistItem = $('.playlist-item').first();
            playItem(firstPlaylistItem);
        }
    });

    previousButton.click(() => {
        if (typeof audio !== 'undefined') {
            let previous = getPreviousPlaylistItem();

            if (typeof previous !== 'undefined') {
                if (!audio.paused) {
                    audio.pause();
                }

                playItem(previous);
                
                scrollIntoView(previous, playlist.parent());
            }
        }
    });

    nextButton.click(() => {
        if (typeof audio !== 'undefined') {
            let next = getNextPlaylistItem();

            if (typeof next !== 'undefined') {
                if (!audio.paused) {
                    audio.pause();
                }
                
                playItem(next);

                scrollIntoView(next, playlist.parent());
            }
        }
    });

    progressBar.click((e) => {
        if (typeof audio !== 'undefined') {
            let progressLeft = $(progressBar).position().left;
            let progressRight = progressLeft + $(progressBar).width();
            let clickPosition = e.pageX - e.target.offsetParent.offsetLeft;

            let percentage = (clickPosition - progressLeft) / (progressRight - progressLeft);

            audio.currentTime = Math.floor(percentage * audio.duration);
        }
    });

    scanButton.click(() => {
        let groupingOption = getGroupingOption();
        ipcRenderer.send('scanLibrary', groupingOption);
    });

    searchSubmit.click(() => {
        search();
    });

    searchInput.keypress((e) => {
        if (e.which === 13) {
            search();
            return false;
        }
    });

    searchBackButton.click(() => {
        $(searchBackButton).css('visibility', 'hidden');
        $(searchMessage).css('visibility', 'hidden');
        $(searchForm).css('visibility', 'visible').hide().fadeIn(750);

        let groupingOption = getGroupingOption();
        ipcRenderer.send('getByField', groupingOption);
    });

    settingsButton.click(() => {
        ipcRenderer.send('getSettings');
    });

    $(document).on('click', '.foundItem', (e) => {
        let value = $(e.target).text();
        let groupingOption = getGroupingOption();
        switch (groupingOption) {
            case 'artist':
            case 'album':
            case 'genre':
                if ($(searchMessage).css('visibility') === 'visible') {
                    ipcRenderer.send('getSong', value);
                } else {
                    ipcRenderer.send('getSongsBy', { 'field': groupingOption, 'value': value });
                    $(searchMessage).text(value);
                }
                break;
            case 'title':
                ipcRenderer.send('getSong', value);
                break;
        }
    });

    $(document).on('click', '#modal-close, #modal-cancel', (e) => {
        modalTarget.empty();
    });

    $(document).on('click', '#settings-save', (e) => {
        let settings = {};

        $(modalTarget).find('.field.is-horizontal').each((index, element) => {
            let labelText = $(element).find('.field-label > label').first().text();
            let settingKey = ((labelText.charAt(0).toLowerCase() + labelText.slice(1)).split(' ')).join('');
            let fieldWrap = $(element).find('.field-body > .field').first();
            let settingValue;
            if ($(fieldWrap).find('input').length > 0) {
                settingValue = $(fieldWrap).find('input').val();
                if (settingValue === 'true' || settingValue === 'false') {
                    settingValue = (settingValue === 'true');
                } else if (!isNaN(settingValue)) {
                    if (settingValue.indexOf('.') > -1) {
                        settingValue = parseFloat(settingValue);
                    } else {
                        settingValue = parseInt(settingValue);
                    }
                }
            } else {
                let selectedText = $(fieldWrap).find('option').filter(':selected').first().text();
                settingValue = ((selectedText.charAt(0).toLowerCase() + selectedText.slice(1)).split(' ')).join('');
            }

            settings[settingKey] = settingValue;
        });

        ipcRenderer.send('setSettings', settings);
        ipcRenderer.send('getSettings', {'render': false});
    });

    $(document).on('click', '.playlist-item', (e) => {
        if ($(e.target).closest('tr').hasClass('is-loaded')) {
            if (typeof audio !== 'undefined') {
                if (audio.paused) {
                    audio.play();
                    playPauseButton.find('span > i').removeClass('fa-play').addClass('fa-pause');
                } else {
                    audio.pause();
                    playPauseButton.find('span > i').removeClass('fa-pause').addClass('fa-play');
                }
            }
        } else {
            playItem(e.target);
        }
    });

    function getGroupingOption() {
        let groupingOption;
        groupingOptions.each((index, element) => {
            if ($(element).hasClass('is-active')) {
                groupingOption = $(element).find('a > span').text().toLowerCase();
                return false;
            }
        });
        return groupingOption;
    }

    function getPreviousPlaylistItem() {
        let result = getPrevCurrentNextPlaylistItem();
        return result[0];
    }

    function getCurrentPlaylistItem() {
        let result = getPrevCurrentNextPlaylistItem();
        return result[1];
    }

    function getNextPlaylistItem() {
        let result = getPrevCurrentNextPlaylistItem();
        return result[2];
    }

    function getPrevCurrentNextPlaylistItem() {
        let lastElement;
        let prev, current, next;

        $('.playlist-item').each((index, element) => {
            if (typeof current !== 'undefined') {
                next = element;

                return false;
            }

            if ($(element).hasClass('is-loaded')) {
                prev = lastElement;
                current = element;
            }

            lastElement = element;
        });

        return [prev, current, next];
    }

    function playItem(element) {
        let row = $(element).closest('tr');
        let title = $(row).find('th').text();
        let artist = $(row).find('td').first().text();

        getSongPath(artist, title).then((result) => {
            let filepath = result;

            if (typeof filepath === 'string') {
                if (typeof audio === 'undefined') {
                    audio = new Audio(filepath);
                    audio.addEventListener('ended', audioEndedListener);
                    audio.addEventListener('timeupdate', audioTimeUpdateListener);
                } else {
                    if (!audio.paused) {
                        audio.pause();
                    }

                    audio.src = filepath;
                }
                audio.play();
                playPauseButton.find('span > i').removeClass('fa-play').addClass('fa-pause');
            }
        });

        getCoverArt(playlistItems[$(row).index()]).then((result) => {
            if (typeof result !== 'undefined') {
                setCoverArt(result, 0);
            }
        });

        $('.playlist-item').each((index, element) => {
            $(element).removeClass('is-loaded');
            $(element).removeClass('has-cursor');
        });

        $(row).addClass('is-loaded');
        $(row).addClass('has-cursor');
    }

    async function search() {
        let field = getGroupingOption();
        let searchPhrase = searchInput.val();
        let result = await searchByField(field, searchPhrase);

        ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'finderResult.ejs'), { result: result }, (err, str) => {
            if (err) {
                console.error(err.message);
            } else {
                finderTarget.empty();
                finderTarget.append(str);
                $(finderTarget).hide().fadeIn(750);

                $(searchForm).css('visibility', 'hidden');
                $(searchBackButton).css('visibility', 'visible').hide().fadeIn(750);
            }
        });

        searchInput.val('');
    }

    function scrollIntoView(element, container) {
        let containerTop = $(container).scrollTop();
        let containerBottom = containerTop + $(container).height();
        let elemTop = element.offsetTop;
        let elemBottom = elemTop + $(element).height();
        if (elemTop < containerTop) {
          $(container).animate({
              scrollTop: elemTop
          }, 500);
        } else if (elemBottom > containerBottom) {
          $(container).animate({
              scrollTop: (elemBottom - $(container).height())
          }, 500);
        }
    }

    function audioEndedListener() {
        let next = getNextPlaylistItem();
        if (typeof next !== 'undefined') {
            playItem(next);
            scrollIntoView(next, playlist.parent());
        } else {
            let current = getCurrentPlaylistItem();
            $(current).removeClass('is-loaded');
            playPauseButton.find('span > i').removeClass('fa-pause').addClass('fa-play');
            audio = undefined;
        }
        $(coverArtHolder).css('visibility', 'hidden');
    }

    function audioTimeUpdateListener() {
        let progress = audio.currentTime === 0 ? 0 : Math.ceil(audio.currentTime / audio.duration * 100);
        progressBar.val(progress);

        songCurrentTime.text(formatTime(audio.currentTime));
        songDuration.text(formatTime(audio.duration));
    }
});

ipcRenderer.on('finderResult', (event, arg) => {
    ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'finderResult.ejs'), { result: arg }, (err, str) => {
        if (err) {
            console.error(err.message);
        } else {
            finderTarget.empty();
            finderTarget.append(str);

            $(finderTarget).hide().fadeIn(750);
        }
    });
});

ipcRenderer.on('initGroupingOption', (event, arg) => {
    groupingOptions.each((index, element) => {
        if ($(element).find('a > span').text().toLowerCase() === arg) {
            $(element).addClass('is-active');
        } else {
            $(element).removeClass('is-active');
        }
    });
});

ipcRenderer.on('listSongsResult', (event, arg) => {
    let result = []
    for (let i = 0; i < arg.length; i++) {
        result.push(arg[i]['title']);
    }

    ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'finderResult.ejs'), { result: result }, (err, str) => {
        if (err) {
            console.error(err.message);
        } else {
            finderTarget.empty();
            finderTarget.append(str);
            $(finderTarget).hide().fadeIn(750);

            $(searchForm).css('visibility', 'hidden');
            $(searchBackButton).css('visibility', 'visible').hide().fadeIn(750);
            $(searchMessage).css('visibility', 'visible').hide().fadeIn(750);
        }
    });
});

ipcRenderer.on('getSongResult', (event, arg) => {
    let alreadyInPlaylist = false;
    for (let i in playlistItems) {
        let playlistItem = playlistItems[i];

        if ((playlistItem['artist'] === arg['artist']) &&
                (playlistItem['title'] === arg['title']) &&
                (playlistItem['album'] === arg['album'])) {
            alreadyInPlaylist = true;
            break;
        }
    }

    if (!alreadyInPlaylist) {
        ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'playlistItem.ejs'), { song: arg }, (err, str) => {
            if (err) {
                console.error(err.message);
            } else {
                playlist.append(str);

                adjustPlaylistHeaderOffset();
            }
        });

        playlistItems.push(arg);
    }
});

ipcRenderer.on('getSettingsResult', (event, arg) => {
    if (arg.render) {
        ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'settings.ejs'),
            { settings: arg['settings'], schema: arg['schema'] }, (err, str) => {
                if (err) {
                    console.error(err.message);
                } else {
                    modalTarget.append(str);
                }
        });
    }

    settings = arg['settings'];
});

ipcRenderer.on('setSettingsResult', (event, arg) => {
    if (arg.length === 0) {
        modalTarget.empty();
    } else {
        console.log(arg);

        // TODO
        // display error message
    }
});

ipcRenderer.on('savePlaylist', (event, arg) => {
    ipcRenderer.send('savePlaylist', playlistItems);
});

ipcRenderer.on('getSavedPlaylistResult', (event, arg) => {
    for (let i = 0; i < arg.length; i++) {
        ipcRenderer.send('getSong', arg[i].title);
    }
});

function getSearchIgnoreCase() {
    return new Promise((resolve) => {
        ipcRenderer.send('getSearchIgnoreCase');
        ipcRenderer.on('searchIgnoreCaseResult', (event, arg) => {
            resolve(arg);
        });
    });
}

function getSongPath(artist, title) {
    return new Promise((resolve) => {
        ipcRenderer.send('getSongPath', {'artist': artist, 'title': title});
        ipcRenderer.on('getSongPathResult', (event, arg) => {
            resolve(arg);
        });
    });
}

function getCoverArt(song) {
    return new Promise((resolve) => {
        ipcRenderer.send('getCoverArt', song);
        ipcRenderer.on('getCoverArtResult', (event, arg) => {
            resolve(arg);
        });
    });
}

function searchByField(field, searchPhrase) {
    return new Promise((resolve) => {
        ipcRenderer.send('searchByField', {'field': field, 'searchPhrase': searchPhrase});
        ipcRenderer.on('searchResult', (event, arg) => {
            resolve(arg);
        });
    });
}

function formatTime(floatSecTime) {
    let minutes = Math.floor(floatSecTime / 60);
    let seconds = Math.floor(floatSecTime % 60);
    let timeStr = '';
    if (minutes < 10) {
        timeStr += '0';
    }
    timeStr += minutes;
    timeStr += ':';
    if (seconds < 10) {
        timeStr += '0';
    }
    timeStr += seconds;
    return timeStr;
}

function getSetting(key) {
    if (typeof settings === 'undefined') {
        return undefined;
    } else if (!settings.hasOwnProperty(key)) {
        return undefined;
    } else {
        return settings[key];
    }
}

function adjustPlaylistHeaderOffset() {
    let scrollbarWidth = playlistTable.width() - playlist.width();
    if (scrollbarWidth > 4) {
        $(playlistHeaderLastColumn).css('marginLeft', '-' + (scrollbarWidth - 2) + 'px');
    } else {
        $(playlistHeaderLastColumn).css('marginLeft', '0px');
    }
}

function setCoverArt(image_links, index) {
    $.get(image_links[index])
        .done((res) => {
            $(coverArtHolder).css('background-image', 'url("' + image_links[index] + '")');
            $(coverArtHolder).css('visibility', 'visible').hide().fadeIn(750);
        })
        .fail((err) => {
            setCoverArt(image_links, ++index);
        });
}
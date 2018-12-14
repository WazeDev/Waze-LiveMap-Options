// ==UserScript==
// @name            Waze LiveMap Options
// @namespace       WazeDev
// @version         2018.12.07.001
// @description     Adds options to LiveMap to alter the Waze-suggested routes.
// @author          MapOMatic
// @include         /^https:\/\/www.waze.com\/.*livemap/
// @contributionURL https://github.com/WazeDev/Thank-The-Authors
// @license         GNU GPL v3
// @grant           none
// @noframes
// ==/UserScript==

/* global W */
/* global Node */
/* global $ */

(function() {
    'use strict';
    const EXPANDED_MAX_HEIGHT = '200px';
    const TRANS_TIME = '0.2s';
    const CSS = [
        '.lmo-options-header { padding-left: 27px; margin-top: 4px; cursor: pointer; color: #59899e; font-size: 11px; font-weight: 600; }',
        '.lmo-options-header i { margin-left: 5px; }',
        '.lmo-options-container { padding-left: 27px; padding-right: 12px; max-height: 500px; overflow: hidden; transition: max-height ' + TRANS_TIME + '; -moz-transition: max-height ' + TRANS_TIME + '; -webkit-transition: max-height ' + TRANS_TIME + '; -o-transition: max-height ' + TRANS_TIME + '; }',
        '.lmo-table { margin-top: 4px; font-size: 12px; border-collapse: collapse; }',
        '.lmo-table td { padding: 4px 10px 4px 10px; border: 1px solid #ddd; border-radius: 6px; }',
        '.lmo-table-header-text { margin: 0px; font-weight: 600; }',
        '.lmo-control-container { margin-right: 8px; }',
        '.lmo-control-container label { line-height: 18px; vertical-align: text-bottom; }',
        '.lmo-table input[type="checkbox"] { margin-right: 2px; }',
        '.lmo-table td.lmo-header-cell { padding-left: 4px; padding-right: 4px; }'
    ].join('\n');

    let _fitBounds;
    let _settings = {
        'lmo-tolls': {checked:false},
        'lmo-freeways': {checked:false},
        'lmo-ferries': {checked:false},
        'lmo-difficult-turns':{checked:false},
        'lmo-unpaved-roads': {checked:true},
        'lmo-long-unpaved-roads': {checked:false},
        'lmo-u-turns':{checked:false, opposite:true},
        'lmo-hov':{checked:false, opposite:true},
        'lmo-hide-traffic':{checked:false},
        'lmo-day': 'today',
        'lmo-hour': 'now',
        collapsed: false
    };

    /* NOTES
    W.app.map.getGeoEnv() gets the server (na, row,

    var l = navigator.language || navigator.userLanguage;
    var url = `https://www.waze.com/row-Descartes/app/Features?language=${l}&bbox=${b._southWest.lng}%2C${b._southWest.lat}%2C${b._northEast.lng}%2C${b._northEast.lat}&restrictedAreas=true`;
    jQuery.getJSON(url, {}, res => { })  // res.countries.objects ... those contain the .restrictionSubscriptions JSON object
    */

    function checked(id, optionalSetTo) {
        let $elem = $('#' + id);
        if (typeof optionalSetTo !== 'undefined') {
            $elem.prop('checked', optionalSetTo);
        } else {
            return $elem.prop('checked');
        }
    }

    function getDateTimeOffset() {
        let hour = $('#lmo-hour').val();
        let day  = $('#lmo-day').val();
        if (hour === '---') hour = 'now';
        if (day  === '---') day = 'today';
        if (hour === '') hour = 'now';
        if (day  === '') day = 'today';

        let t = new Date();
        let thour = (t.getHours() * 60) + t.getMinutes();
        let tnow = (t.getDay() * 1440) + thour;
        let tsel = tnow;

        if (hour === 'now') {
            if (day === '0')     tsel = (parseInt(day) * 1440) + thour;
            if (day === '1')     tsel = (parseInt(day) * 1440) + thour;
            if (day === '2')     tsel = (parseInt(day) * 1440) + thour;
            if (day === '3')     tsel = (parseInt(day) * 1440) + thour;
            if (day === '4')     tsel = (parseInt(day) * 1440) + thour;
            if (day === '5')     tsel = (parseInt(day) * 1440) + thour;
            if (day === '6')     tsel = (parseInt(day) * 1440) + thour;
        } else {
            if (day === 'today') tsel = (t.getDay()    * 1440) + parseInt(hour);
            if (day === '0')     tsel = (parseInt(day) * 1440) + parseInt(hour);
            if (day === '1')     tsel = (parseInt(day) * 1440) + parseInt(hour);
            if (day === '2')     tsel = (parseInt(day) * 1440) + parseInt(hour);
            if (day === '3')     tsel = (parseInt(day) * 1440) + parseInt(hour);
            if (day === '4')     tsel = (parseInt(day) * 1440) + parseInt(hour);
            if (day === '5')     tsel = (parseInt(day) * 1440) + parseInt(hour);
            if (day === '6')     tsel = (parseInt(day) * 1440) + parseInt(hour);
        }

        let diff = tsel - tnow;
        if (diff < -3.5 * 1440)
            diff += 7 * 1440;
        else if (diff > 3.5 * 1440)
            diff -= 7 * 1440;

        return diff;
    }

    function getRouteTime(routeIdx) {
        let sec = W.app.routing.routing.store.state.routes[routeIdx].seconds;
        let hours = Math.floor(sec/3600);
        sec -= hours * 3600;
        let min = Math.floor(sec/60);
        sec -= min * 60;
        return (hours > 0 ? hours + ' h ' : '') + (min > 0 ? min + ' min ' : '') + sec + ' sec';
    }

    function updateTimes() {
        let $routeTimes = $('.wm-route-item__time');
        for (let idx=0; idx<$routeTimes.length; idx++) {
            let time = getRouteTime(idx);
            let $routeTime = $routeTimes.eq(idx);
            let contents = $routeTime.contents();
            contents[contents.length-1].remove();
            $routeTime.append(' ' + time);
        }
    }

    function fetchRoutes() {
        // Does nothing if "from" and "to" haven't been specified yet.
        if (W.app.store.state.routing && W.app.store.state.routing.from && W.app.store.state.routing.to) {
            // HACK - Temporarily remove the onAfterItemAdded function, to prevent map from moving.
            W.app.map.fitBounds = function() {};

            // Trigger the route search.
            W.app.routing.routing.findRoutes()
        }
    }

    function addOptions() {
        if (!$('#lmo-table').length) {
            $('.wm-route-search').after(
                $('<div>', {class:'lmo-options-header'}).append(
                    $('<span>').text('Change routing options'),
                    $('<i>', {class:'fa fa.fa-angle-down fa.fa-angle-up'}).addClass(_settings.collapsed ? 'fa-angle-down' : 'fa-angle-up')
                ),
                $('<div>', {class: 'lmo-options-container'}).css({maxHeight:_settings.collapsed ? '0px' : EXPANDED_MAX_HEIGHT}).append(
                    $('<table>', {class: 'lmo-table'}).append(
                        [['Avoid:',['Tolls','Freeways','Ferries','HOV','Unpaved roads','Long unpaved roads','Difficult turns','U-Turns']], ['Options:',['Hide traffic']]].map(rowItems => {
                            let rowID = rowItems[0].toLowerCase().replace(/[ :]/g,'');
                            return $('<tr>', {id:'lmo-row-' + rowID}).append(
                                $('<td>', {class: 'lmo-header-cell'}).append($('<span>', {id:'lmo-header-' + rowID, class:'lmo-table-header-text'}).text(rowItems[0])),
                                $('<td>', {class: 'lmo-settings-cell'}).append(
                                    rowItems[1].map((text) => {
                                        let idName = text.toLowerCase().replace(/ /g, '-');
                                        let id = 'lmo-' + idName;
                                        return $('<span>', {class:'lmo-control-container'}).append(
                                            $('<input>', {id:id, type:'checkbox', class:'lmo-control'}).prop('checked',_settings[id].checked), $('<label>', {for:id}).text(text)
                                        );
                                    })
                                )
                            );
                        })
                    )
                )
            );
            $('#lmo-header-avoid').css({color:'#c55'});
            $('label[for="lmo-u-turns"').attr('title','Note: this is not an available setting in the app');

            let timeArray = [['Now','now']];
            for (let i=0; i<48; i++) {
                let t = i * 30;
                let min = t % 60;
                let hr = Math.floor(t / 60);
                let str = (hr < 10 ? ('0') : '') + hr + ':' + (min === 0 ? '00' : min);
                timeArray.push([str, t.toString()]);
            }
            $('#lmo-row-options td.lmo-settings-cell').append(
                $('<div>', {class: 'lmo-date-time'}).append(
                    $('<label>', {for:'lmo-day', style:'font-weight: normal;'}).text('Day'),
                    $('<select>', {id: 'lmo-day', class:'lmo-control', style:'margin-left: 4px; margin-right: 8px; padding: 0px; height: 22px;'}).append(
                        [
                            ['Today','today'],
                            ['Monday','1'],
                            ['Tuesday','2'],
                            ['Wednesday','3'],
                            ['Thursday','4'],
                            ['Friday','5'],
                            ['Saturday','6'],
                            ['Sunday','0']
                        ].map(val => $('<option>', {value:val[1]}).text(val[0]))
                    ),
                    $('<label>', {for:'lmo-hour', style:'font-weight: normal;'}).text('Time'),
                    $('<select>', {id: 'lmo-hour', class:'lmo-control', style:'margin-left: 4px; margin-right: 8px; padding: 0px; height: 22px;'}).append(
                        timeArray.map(val => $('<option>', {value:val[1]}).text(val[0]))
                    )
                )
            );

            // Set up events
            $('.lmo-options-header').click(function() {
                let $container = $('.lmo-options-container');
                let collapsed = $container.css('max-height') === '0px';
                $('.lmo-options-header i').removeClass(collapsed ? 'fa-angle-down' : 'fa-angle-up').addClass(collapsed ? 'fa-angle-up' : 'fa-angle-down');
                $container.css({maxHeight: collapsed ? EXPANDED_MAX_HEIGHT : '0px'});
                _settings.collapsed = !collapsed;
            });
            $('.lmo-control').change(function() {
                let id = this.id;
                if (id === 'lmo-hour' || id === 'lmo-day') {
                    fetchRoutes();
                } else {
                    let isChecked = checked(id);
                    _settings[id].checked = isChecked;
                    if (id === 'lmo-hide-traffic') {
                        if (isChecked) {
                            W.app.geoRssLayer._jamsLayer.remove();
                        } else {
                             W.app.geoRssLayer._jamsLayer.addTo(W.app.map);
                        }
                    } else {
                        if (id === 'lmo-long-unpaved-roads') {
                            if (isChecked) {
                                checked('lmo-unpaved-roads', false);
                                _settings['lmo-unpaved-roads'].checked = false;
                            }
                        } else if (id === 'lmo-unpaved-roads') {
                            if (isChecked) {
                                checked('lmo-long-unpaved-roads', false);
                                _settings['lmo-long-unpaved-roads'].checked = false;
                            }
                        }
                        fetchRoutes();
                    }
                }
            });
        }
    }

    function installHttpRequestInterceptor() {
        // Special thanks to Twister-UK for finding this code example...
        // original code from https://stackoverflow.com/questions/42578452/can-one-use-the-fetch-api-as-a-request-interceptor
        window.fetch = (function (origFetch) {
            return function myFetch(req) {
                let url = arguments[0];
                if(url.indexOf('/routingRequest?') !== -1)
                {
                    // Remove all options from the request (everything after '&options=')
                    let baseData = url.replace(url.match(/&options=(.*)/)[1],'');
                    // recover stuff after the &options bit...
                    let otherBits = '&returnGeometries' + url.split('&returnGeometries')[1];
                    let options = [];
                    [['tolls','AVOID_TOLL_ROADS'],['freeways','AVOID_PRIMARIES'],['ferries','AVOID_FERRIES'],['difficult-turns','AVOID_DANGEROUS_TURNS'],['u-turns','ALLOW_UTURNS'],['hov','ADD_HOV_ROUTES']].forEach(optionInfo => {
                        let id = 'lmo-' + optionInfo[0];
                        let enableOption = checked(id);
                        if (_settings[id].opposite) enableOption = !enableOption;
                        options.push(optionInfo[1] + ':' + (enableOption ? 't' : 'f'));
                    });
                    if (checked('lmo-long-unpaved-roads')) {
                        options.push('AVOID_LONG_TRAILS:t');
                    } else if (checked('lmo-unpaved-roads')) {
                        options.push('AVOID_TRAILS:t');
                    } else {
                        options.push('AVOID_LONG_TRAILS:f');
                    }
                    baseData = baseData.replace(/\?at=0/,'?at=' + getDateTimeOffset());
                    url = baseData + encodeURIComponent(options.join(',')) + otherBits;
                    arguments[0] = url;
                }

                let result = origFetch.apply(this, arguments);
                ////result.then(someFunctionToDoSomething);
                return result; // or return the result of the `then` call
            };
        })(fetch);
    }

    function getPassesAsync() {
        return new Promise((resolve, reject) => {
            let geo = W.app.map.getGeoEnv();
            let b = W.app.map.getBounds();
            let l = navigator.language || navigator.userLanguage;
            let url = `https://www.waze.com/${geo==='na'?'':geo+'-'}Descartes/app/Features?language=${l}&bbox=${b._southWest.lng}%2C${b._southWest.lat}%2C${b._northEast.lng}%2C${b._northEast.lat}`;

            $.getJSON(url, res => {
                let passes = {};
                res.countries.objects.forEach(c => {
                    Object.keys(c.restrictionSubscriptions).forEach(key => (passes[key] = c.restrictionSubscriptions[key]))
                });
                resolve(passes);
            });
        });
    }

    function init() {
        getPassesAsync().then(passes => {

            debugger;

            // Insert CSS styling.
            $('head').append( $('<style>', {type:'text/css'}).html(CSS) );

            // Add the xmlhttp request interceptor, so we can insert our own options into the routing requests.
            installHttpRequestInterceptor();

            // Add all of the DOM stuff for this script.
            addOptions();

            // Watch for the "waiting" spinner so we can disable and enable things while LM is fetching routes.
            let observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    if (mutation.attributeName === 'class') {
                        let waitingSpinner = !$(mutation.target).hasClass('wm-hidden');
                        $('.lmo-control').prop('disabled', waitingSpinner);
                        if (!waitingSpinner) {
                            W.app.map.fitBounds = _fitBounds;
                        }
                    }
                });
            });
            observer.observe($('.wm-route-search__spinner')[0], { childList: false, subtree: false, attributes: true });


            // Watch for routes being displayed, so we can update the displayed times.
            observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    for (var i = 0; i < mutation.addedNodes.length; i++) {
                        let addedNode = mutation.addedNodes[i];
                        if (addedNode.nodeType === Node.ELEMENT_NODE && $(addedNode).hasClass('wm-route-list__routes')) {
                            updateTimes();
                        }
                    }
                });
            });
            observer.observe($('.wm-route-list')[0], { childList: true, subtree: true });

            // Remove the div that contains the native LiveMap options for setting departure time.
            $('div.wm-route-schedule').remove();

            // Remove the routing tip (save some space).
            $('div.wm-routing__tip').remove();

            // Store the fitBounds function.  It is removed and re-added, to prevent the
            // LiveMap api from moving the map to the boundaries of the routes every time
            // an option is checked.
            _fitBounds = W.app.map.fitBounds;
        });
    }

    // Run the script.
    init();
})();

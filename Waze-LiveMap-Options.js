// ==UserScript==
// @name        Waze LiveMap Options
// @namespace   WazeDev
// @version     2017.12.12.003
// @description Adds options to LiveMap to alter the Waze-suggested routes.
// @author      MapOMatic
// @include     /^https:\/\/www.waze.com\/livemap/
// @license     GNU GPL v3
// ==/UserScript==

/* global W */
/* global Node */

(function() {
    'use strict';
    var EXPANDED_MAX_HEIGHT = '200px';

    var _settings = {
        'lmo-tolls': {checked:false},
        'lmo-freeways': {checked:false},
        'lmo-ferries': {checked:false},
        'lmo-difficult-turns':{checked:false},
        'lmo-dirt-roads': {checked:true},
        'lmo-long-dirt-roads': {checked:false},
        'lmo-u-turns':{checked:false, opposite:true},
        'lmo-hov':{checked:false, opposite:true},
        'lmo-real-time-traffic':{checked:true},
        'lmo-hide-traffic':{checked:false},
        collapsed: false
    };
    // Store the onAfterItemAdded function.  It is removed and re-added, to prevent the
    // LiveMap api from moving the map to the boundaries of the routes every time
    // an option is checked.
    var _onAfterItemAdded =  W.controller._routePaths.onAfterItemAdded;

    function checked(id, optionalSetTo) {
        var $elem = $('#' + id);
        if (typeof optionalSetTo !== 'undefined') {
            $elem.prop('checked', optionalSetTo);
        } else {
            return $elem.prop('checked');
        }
    }

    function updateTimes() {
        var realTimeTraffic = checked('lmo-real-time-traffic');
        var $routeTimes = $('.routes .route-time');
        for (var idx=0; idx<$routeTimes.length; idx++) {
            var time = getRouteTime(idx, realTimeTraffic);
            var $routeTime = $routeTimes.eq(idx);
            var contents = $routeTime.contents();
            contents[contents.length-1].remove();
            $routeTime.append(' ' + time);
        }
    }

    function addOptions() {
        if (!$('#lmo-table').length) {
            $('.search-forms').after(
                $('<div>', {class:'lmo-options-header'}).append(
                    $('<span>').text('Change routing options'),
                    $('<i>', {class:'fa fa.fa-angle-down fa.fa-angle-up'}).addClass(_settings.collapsed ? 'fa-angle-down' : 'fa-angle-up')
                ),
                $('<div>', {class: 'lmo-options-container'}).css({maxHeight:_settings.collapsed ? '0px' : EXPANDED_MAX_HEIGHT}).append(
                    $('<table>', {class: 'lmo-table'}).append(
                        [['Avoid:',['Tolls','Freeways','Ferries','HOV','Dirt roads','Long dirt roads','Difficult turns','U-Turns']], ['Options:',['Real-time traffic','Hide traffic']]].map(rowItems => {
                            return $('<tr>').append(
                                $('<td>').append($('<span>', {id:'lmo-header-' + rowItems[0].toLowerCase().replace(/[ :]/g,''), class:'lmo-table-header-text'}).text(rowItems[0])),
                                $('<td>').append(
                                    rowItems[1].map((text) => {
                                        var idName = text.toLowerCase().replace(/ /g, '-');
                                        var id = 'lmo-' + idName;
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

            // Set up events
            $('.lmo-options-header').click(function() {
                var $container = $('.lmo-options-container');
                var collapsed = $container.css('max-height') === '0px';
                $('.lmo-options-header i').removeClass(collapsed ? 'fa-angle-down' : 'fa-angle-up').addClass(collapsed ? 'fa-angle-up' : 'fa-angle-down');
                $container.css({maxHeight: collapsed ? EXPANDED_MAX_HEIGHT : '0px'});
                _settings.collapsed = !collapsed;
            });
            $('.lmo-control').change(function() {
                var id = this.id;
                var isChecked = checked(id);
                _settings[id].checked = isChecked;
                if (id === 'lmo-real-time-traffic') {
                    updateTimes();
                } else if (id === 'lmo-hide-traffic') {
                    W.controller._mapModel.features.enableJams(!isChecked);
                } else {
                    if (id === 'lmo-long-dirt-roads') {
                        if (isChecked) {
                            checked('lmo-dirt-roads', false);
                            _settings['lmo-dirt-roads'].checked = false;
                        }
                    } else if (id === 'lmo-dirt-roads') {
                        if (isChecked) {
                            checked('lmo-long-dirt-roads', false);
                            _settings['lmo-long-dirt-roads'].checked = false;
                        }
                    }
                    var routeSearch = W.controller._routeSearch;
                    if (routeSearch.to.address.attributes.latlng && routeSearch.from.address.attributes.latlng) {//($('div#origin input.query').val() && $('div#destination input.query').val()) {
                        $('.lmo-control').prop('disabled',true);
                        // Temporarily remove the onAfterItemAdded function, to prevent map from moving.
                        W.controller._routePaths.onAfterItemAdded = null;
                        routeSearch.fetchRoutes();
                        // This pause is needed to prevent clicking other options too quickly, which causes a "Whoa! Something went wrong" error.
                        // I tried using the .then() function of the returned promise from fetchRoutes, but that didn't seem to work.
                        // Maybe there's an event that can be hooked somewhere, but I haven't found it yet.
                        setTimeout(() => {
                            $('.lmo-control').prop("disabled", false);
                            W.controller._routePaths.onAfterItemAdded = _onAfterItemAdded;
                        }, 500);
                    }
                }
            });
        }
    }

    var observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            for (var i = 0; i < mutation.addedNodes.length; i++) {
                var addedNode = mutation.addedNodes[i];
                if (addedNode.nodeType === Node.ELEMENT_NODE){
                    if (addedNode.className === 'search-forms') {
                        addOptions();
                    } else if ($(addedNode).hasClass('route-info')) {
                        updateTimes();
                    }
                }
            }
        });
    });
    addOptions();
    observer.observe($('.leaflet-top')[0], { childList: true, subtree: true });

    function getRouteTime(routeIdx, realTimeTraffic) {
        var sec = 0;
        W.controller._routes.models[routeIdx].attributes.results.forEach(result => {
            sec += realTimeTraffic ? result.crossTime : result.crossTimeWithoutRealTime;
        });
        var hours = Math.floor(sec/3600);
        sec -= hours * 3600;
        var min = Math.floor(sec/60);
        sec -= min * 60;
        return (hours > 0 ? hours + 'h ' : '') + (min > 0 ? min + 'm ' : '') + sec + 's';
    }

    $.ajaxPrefilter(function(request, originalRequest, jqXHR) {
        if (originalRequest.url === '/RoutingManager/routingRequest') {
            // Remove all options from the request (everything after '&options=')
            var baseData = request.data.replace(request.data.match(/&options=(.*)/)[1],'');
            var options = [];
            [['tolls','AVOID_TOLL_ROADS'],['freeways','AVOID_PRIMARIES'],['ferries','AVOID_FERRIES'],['difficult-turns','AVOID_DANGEROUS_TURNS'],['u-turns','ALLOW_UTURNS'],['hov','ADD_HOV_ROUTES']].forEach(optionInfo => {
                var id = 'lmo-' + optionInfo[0];
                var enableOption = checked(id);
                if (_settings[id].opposite) enableOption = !enableOption;
                options.push(optionInfo[1] + ':' + (enableOption ? 't' : 'f'));
            });
            if (checked('lmo-long-dirt-roads')) {
                options.push('AVOID_LONG_TRAILS:t');
            } else if (checked('lmo-dirt-roads')) {
                options.push('AVOID_TRAILS:t');
            } else {
                options.push('AVOID_LONG_TRAILS:f');
            }
            request.data = baseData + encodeURIComponent(options.join(','));
        }
    });

    var transTime = '0.2s';
    var css = [
        '.lmo-options-header { margin-top: 4px; cursor: pointer; color: #59899e; font-size: 11px; font-weight: 600; }',
        '.lmo-options-header i { margin-left: 5px; }',
        '.lmo-options-container { max-height: 500px; overflow: hidden; transition: max-height ' + transTime + '; -moz-transition: max-height ' + transTime + '; -webkit-transition: max-height ' + transTime + '; -o-transition: max-height ' + transTime + '; }',
        '.lmo-table { margin-top: 4px; font-size: 12px; }',
        '.lmo-table td { padding: 4px 10px 0px 10px; }',
        '.lmo-table-header-text { margin: 0px; font-weight: 600; }',
        '.lmo-control-container { margin-right: 8px; }'
    ].join('\n');
    $('head').append( $('<style>', {type:'text/css'}).html(css) );
})();
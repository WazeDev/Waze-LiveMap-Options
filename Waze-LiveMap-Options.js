// ==UserScript==
// @name        Waze LiveMap Options
// @namespace   WazeDev
// @version     2017.12.10.001
// @description Adds options to LiveMap to alter the Waze-suggested routes.
// @author      MapOMatic
// @include     /^https:\/\/www.waze.com\/livemap/
// @license     GNU GPL v3
// ==/UserScript==

(function() {
    'use strict';
    var settings = {
        'lmo-tolls': false,
        'lmo-freeways': false,
        'lmo-difficult-turns':false,
        'lmo-dirt-roads': true,
        'lmo-long-dirt-roads': false,
        'lmo-u-turns':true,
        'lmo-real-time-traffic':true
    };

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

    function addChecks() {
        if (!$('#lmo-table').length) {
            $('.search-forms').after(
                $('<table>', {class: 'lmo-table'}).append(
                    [['Avoid:',['Tolls','Freeways','Difficult turns','Dirt roads','Long dirt roads']], ['Allow:',['U-Turns']], ['Options:',['Real-time traffic']]].map(rowItems => {
                        return $('<tr>').append(
                            $('<td>').append($('<span>', {id:'lmo-header-' + rowItems[0].toLowerCase().replace(/[ :]/g,''), class:'lmo-table-header-text'}).text(rowItems[0])),
                            $('<td>').append(
                                rowItems[1].map((text) => {
                                    var idName = text.toLowerCase().replace(/ /g, '-');
                                    var id = 'lmo-' + idName;
                                    return $('<span>', {class:'lmo-control-container'}).append(
                                        $('<input>', {id:id, type:'checkbox', class:'lmo-control'}).prop('checked',settings[id]), $('<label>', {for:id}).text(text)
                                    );
                                })
                            )
                        );
                    })
                )
            );
            $('#lmo-header-allow').css({color:'#393'});
            $('#lmo-header-avoid').css({color:'#c55'});
            $('.lmo-control').change(function() {
                var id = this.id;
                var isChecked = checked(id);
                settings[id] = isChecked;
                if (id === 'lmo-real-time-traffic') {
                    updateTimes();
                } else {
                    if (id === 'lmo-long-dirt-roads') {
                        if (isChecked) {
                            checked('lmo-dirt-roads', false);
                            settings['lmo-dirt-roads'] = false;
                        }
                    } else if (id === 'lmo-dirt-roads') {
                        if (isChecked) {
                            checked('lmo-long-dirt-roads', false);
                            settings['lmo-long-dirt-roads'] = false;
                        }
                    }
                    var routeSearch = W.controller._routeSearch;
                    if (routeSearch.to.address.attributes.latlng && routeSearch.from.address.attributes.latlng) {//($('div#origin input.query').val() && $('div#destination input.query').val()) {
                        $('.lmo-control').prop('disabled',true);
                        routeSearch.fetchRoutes();
                        // This pause is needed to prevent clicking other options too quickly, which causes a "Whoa! Something went wrong" error.
                        // I tried using the .then() function of the returned promise from fetchRoutes, but that didn't seem to work.
                        // Maybe there's an event that can be hooked somewhere, but I haven't found it yet.
                        setTimeout(() => {
                            $('.lmo-control').prop("disabled", false);
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
                        addChecks();
                    } else if ($(addedNode).hasClass('route-info')) {
                        updateTimes();
                    }
                }
            }
        });
    });
    addChecks();
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
            [['tolls','AVOID_TOLL_ROADS'],['freeways','AVOID_PRIMARIES'],['difficult-turns','AVOID_DANGEROUS_TURNS'],['u-turns','ALLOW_UTURNS']].forEach(optionInfo => {
                options.push(optionInfo[1] + ':' + (checked('lmo-' + optionInfo[0]) ? 't' : 'f'));
            });
            if (checked('lmo-long-dirt-roads')) {
                options.push('AVOID_LONG_TRAILS:t');
            } else if (checked('lmo-dirt-trails')) {
                options.push('AVOID_TRAILS:t');
            } else {
                options.push('AVOID_LONG_TRAILS:f');
            }
            request.data = baseData + encodeURIComponent(options.join(','));
        }
    });

    var css = [
        '.lmo-table { margin-top: 4px;font-size: 12px }',
        '.lmo-table td { padding: 4px 10px 0px 10px; }',
        '.lmo-table-header-text { margin: 0px;font-weight: 600; }',
        '.lmo-control-container { margin-right: 8px; }'
    ].join('\n');
    $('head').append( $('<style>', {type:'text/css'}).html(css) );
})();

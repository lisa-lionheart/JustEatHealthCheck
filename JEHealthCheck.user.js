// ==UserScript==
// @name         Just Eat Hygine Check
// @namespace    https://github.com/lisa-lionheart/JustEatHealthCheck
// @version      1.3
// @description  Check the ratings.food.gov for restaurants on just eat and hungery house
// @author       Lisa Croxford
// @require       http://ajax.googleapis.com/ajax/libs/jquery/1.2.6/jquery.js
// @match        http://www.just-eat.co.uk/*
// @match        https://www.just-eat.co.uk/*
// @match        http://hungryouse.co.uk/*
// @match        https://hungryhouse.co.uk/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==


var DATA_STORE_VERSION = 2;

function normalizeBuisnessName(name) {
    name = name.toLowerCase();
    name = name.replace('&', 'and');
    name = name.replace(' restaurant', '');

    return name;
}

function normalizeAddress(address) {

    address = address.trim().replace('\n','').replace('\n',', ').split(', ').map(function(line){ return line.trim(); });

    var street = address[0].replace('\'','');
    var postCode = address[address.length-1].trim().replace(/ \(.+\)/g, '');

    if(address.length == 3) {
        return [street,address[1], postCode];
    } 

    if(address.length == 4) {
        return [street,address[2], postCode];
    }

    console.log('failed to normalize address', address);
}

function checkName(establismentData, jeName) {

    govName = normalizeBuisnessName(establismentData.BusinessName);
    jeName = normalizeBuisnessName(jeName);

    if(govName === jeName) 
        return true;

    if(govName.indexOf(jeName) !== -1)
        return true;


    if(jeName.indexOf(govName) !== -1)
        return true;


    //console.log('Rejected match:', govName, 'not match', jeName);
    return false;
}

function callApi(method,args, done) {

    var qs = [];
    for(var k in args) {  
        qs.push( k + '='+args[k]);
    }

    GM_xmlhttpRequest({
        method: "GET",
        url: 'http://api.ratings.food.gov.uk/'+method+'?'+qs.join('&'),
        headers: {
            'x-api-version':2,
            accept: 'application/json'
        },
        onload: function(response) {
            done(null,JSON.parse(response.responseText));
        }
    });
}

function apiToResult(e) {
    return    {
        rating: e.RatingValue,
        image: e.RatingKey+'.JPG',
        name: e.BuisnessName,
        address: [
            e.AddressLine2,
            e.AddressLine3,
            e.PostCode
        ],
        link: 'http://ratings.food.gov.uk/business/en-GB/'+e.FHRSID+'/'+e.BusinessName   
    };         
}

function parseResult(name,address, data, done) {
    var establisments = data.establishments;

    if(data.establishments.length == 1) 
        return done(null, apiToResult(data.establishments[0]));

    for(var i=0; i < data.establishments.length; i++) {
        var e = data.establishments[i];

        if(checkName(e, name)) {
            console.log('Matched', name, 'as', e.BusinessName);
            return done(null, apiToResult(e));
        }
    }

    console.log('Could not match', name, 'at', address);
    console.log('Possibles', data.establishments);

    //Fallthrough
    done(null, null);
}


function getValidCacheItem(id) {
    var result = localStorage.getItem(id);
    if(result && result !== 'undefined') {

        result = JSON.parse(result);

        if(result.version === DATA_STORE_VERSION)
            return result;
    }

    return null
}

function lookup(id, name, address, done) {

    var result = getValidCacheItem(id);
    if(result) return done(null, result);

    lookupNoCache(name,address, function(err,result) {

        if(result) {
            result.version = DATA_STORE_VERSION;
            localStorage.setItem(id, JSON.stringify(result));
        }
        done(err,result);
    });
}


function lookupNoCache(name, address, done) {

    //console.log('Finding rating for ', name);

    var addressQuery = address[0] +', '+ address[2];
    callApi('Establishments', {address:addressQuery}, function(err, data) {

        if(err)
            return done(err);

        if(data.establishments.length !== 0) {
            return parseResult(name,address,data,done);
        }

        console.log('No matches for for ', name, 'at', address, 'expanding search...');

        var streetQuery = address[0].replace(/^([0-9-abcd]+)/,'').substring(1) + ', ' + address[2];

        return callApi('Establishments',{address:streetQuery}, function(err, data) {

            if(err)
                return done(err);

            if(data.establishments.length !== 0) {
                return  parseResult(name,address, data,done);
            }

            console.log('Failed to find match for', name, 'querying',streetQuery);
            done(null,null);
        });
    });
}

var SitesCommon = {

    updateBadgeCallback: function(imageSize, ratingEl) {

        return function(err,result) {

            ratingEl.removeClass('hygineRatingLoading');

            if(err) {
                ratingEl.text('Ooops. something went wrong');   
                return;
            }

            if(result === null) {
                ratingEl.addClass('unrated');
                ratingEl.text('Manual search');   
                ratingEl.attr('href', 'http://ratings.food.gov.uk/');
            } else {
                ratingEl.css('backgroundImage', 'url(http://ratings.food.gov.uk/images/scores/'+imageSize+'/'+result.image+')');
                ratingEl.attr('href',result.link);

            }
        };

    }

};


var ajaxLoader = 'data:image/gif;base64,R0lGODlhEAAQAPIAAP///wAAAMLCwkJCQgAAAGJiYoKCgpKSkiH+GkNyZWF0ZWQgd2l0aCBhamF4bG9hZC5pbmZvACH5BAAKAAAAIf8LTkVUU0NBUEUyLjADAQAAACwAAAAAEAAQAAADMwi63P4wyklrE2MIOggZnAdOmGYJRbExwroUmcG2LmDEwnHQLVsYOd2mBzkYDAdKa+dIAAAh+QQACgABACwAAAAAEAAQAAADNAi63P5OjCEgG4QMu7DmikRxQlFUYDEZIGBMRVsaqHwctXXf7WEYB4Ag1xjihkMZsiUkKhIAIfkEAAoAAgAsAAAAABAAEAAAAzYIujIjK8pByJDMlFYvBoVjHA70GU7xSUJhmKtwHPAKzLO9HMaoKwJZ7Rf8AYPDDzKpZBqfvwQAIfkEAAoAAwAsAAAAABAAEAAAAzMIumIlK8oyhpHsnFZfhYumCYUhDAQxRIdhHBGqRoKw0R8DYlJd8z0fMDgsGo/IpHI5TAAAIfkEAAoABAAsAAAAABAAEAAAAzIIunInK0rnZBTwGPNMgQwmdsNgXGJUlIWEuR5oWUIpz8pAEAMe6TwfwyYsGo/IpFKSAAAh+QQACgAFACwAAAAAEAAQAAADMwi6IMKQORfjdOe82p4wGccc4CEuQradylesojEMBgsUc2G7sDX3lQGBMLAJibufbSlKAAAh+QQACgAGACwAAAAAEAAQAAADMgi63P7wCRHZnFVdmgHu2nFwlWCI3WGc3TSWhUFGxTAUkGCbtgENBMJAEJsxgMLWzpEAACH5BAAKAAcALAAAAAAQABAAAAMyCLrc/jDKSatlQtScKdceCAjDII7HcQ4EMTCpyrCuUBjCYRgHVtqlAiB1YhiCnlsRkAAAOwAAAAAAAAAAAA=='; 



var JustEat = {
    processSearchResult: function(i, el) {

        console.log('processSearchResult');

        var address = normalizeAddress($(el).find('p.address').text());
        var name = $(el).find('h2.name').text().trim();
        var id = $(el).find('h2.name a').attr('data-restaurant-id');

        console.log(name,address);

        var ratingEl = $('<a class="hygineRating hygineRatingLoading"></a>');
        $(el).find('p.viewMenu, p.preOrderButton').append(ratingEl);

        lookup(id, name,address, SitesCommon.updateBadgeCallback('small',ratingEl));   
    },

    processMenuPage: function(i, el) {

        var address = normalizeAddress($('.restInfoAddress').text());
        var name = $('.restaurant-name').text().trim();
        var id = $('#RestaurantId').val();

        var ratingEl = $('<a class="hygineRatingBig hygineRatingLoading"></a>');
        $('#divBasketUpdate').prepend(ratingEl);

        lookup(id, name,address, SitesCommon.updateBadgeCallback('large',ratingEl));   
    },

    initialize: function() {
        var css = '';
        css += '.hygineRatingLoading { background-image: url('+ajaxLoader+'); backgound-repeat: no-repeat !important }'
        css += '.hygineRating { position: absolute; width: 80px !important; background-color: white !important; min-height: 38px; right: 9px; top: 52px; background-position: center; }';
        css += '.hygineRatingBig { display: block; width: 100% !important; min-height: 150px; background-position: center; background-repeat: no-repeat }';

        $('head').append('<style>' + css + '</style>');

        $('.restaurantInner').each(this.processSearchResult);
        $('.restaurant-info-detail').each(this.processMenuPage);
    }
};


var HungryHouse = {

    processMenuPage: function() {

        var ratingEl = $('<a class="hygineRatingBig hygineRatingLoading"></a>');
        $('#shopping-cart-form').prepend(ratingEl);

        var name = $('h1 span').attr('content');
        var address = normalizeAddress($('span.address').text());
        var id = window.location.pathname.substr(1);

        console.log('Name:',name,'address:',address);

        lookup(id, name,address, SitesCommon.updateBadgeCallback('medium',ratingEl));   
    },

    lookupFromId: function(id, done) {

        var result = getValidCacheItem(id);
        if(result) return done(null, result);

        GM_xmlhttpRequest({
            method: "GET",
            url: 'https://hungryhouse.co.uk/'+id,
            onload: function(response) {

                var doc = $(response.responseText);

                var name = doc.find('h1 span').attr('content');
                var address =  normalizeAddress(doc.find('span.address span').get().map(function(el){return $(el).text().trim(); }).join(', '));

                console.log('Name:',name,'address:',address);
                done(null,name,address);
            }
        });

    },

    addRatingToSearchResult: function(el) {

        var id = el.find('.restPageLink').attr('href').substr(1);

        var ratingEl = $('<a class="hygineRating hygineRatingLoading"></a>');
        el.find('.restsRestInfo').append(ratingEl);

        HungryHouse.lookupFromId(id, function(err, name, address) {          
            lookup(id, name,address, SitesCommon.updateBadgeCallback('small',ratingEl));   
        });
    },

    //Hungry house loads stuff with ajax so we have to continuously check
    pollForNewSearchItems: function() {

        $('#searchContainer .restaurantBlock').each(function(i,el) {
            if($(el).find('.hygineRating').length === 0)            
                HungryHouse.addRatingToSearchResult($(el));          
        });
    },

    initialize: function() {
        var css = '';
        css += '.hygineRatingLoading { background-image: url('+ajaxLoader+'); }'
        css += '.restPageLink { top: -5px !important }';
        css += '.hygineRating { display: block; position: relative; float: right; width: 120px !important; min-height: 66px !important; background-position: center; background-repeat: no-repeat; right: 0px; top: -10px;}';
        css += '.hygineRatingBig { display: block; width: 100% !important; min-height: 150px; background-position: center; background-repeat: no-repeat }';

        $('head').append('<style>' + css + '</style>');

        $('#website-restaurant-container').each(this.processMenuPage);
        setInterval(this.pollForNewSearchItems,500);
    }
};


try {

    if(window.location.host === 'www.just-eat.co.uk')  {
        JustEat.initialize();
    }


    if(window.location.host === 'hungryhouse.co.uk')  {
        HungryHouse.initialize();
    }


}catch(e) {
    console.error(e.message, e.stack);
}

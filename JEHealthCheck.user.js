// ==UserScript==
// @name         Just Eat hygiene Check
// @namespace    https://github.com/lisa-lionheart/JustEatHealthCheck
// @version      1.5
// @description  Check the ratings.food.gov for restaurants on just eat and hungry house
// @author       Lisa Croxford
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.2.6/jquery.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/async/1.4.2/async.min.js
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

    updateBadgeCallback: function(imageSize, ratingEl, done) {

        return function(err,result) {

            ratingEl.removeClass('hygieneRatingLoading');

            if(err) {
                ratingEl.text('Ooops. something went wrong');   
                return done(err);
            }

            if(result === null) {
                ratingEl.addClass('unrated');
                ratingEl.attr('data-value', -1);
                ratingEl.text('Manual search');   
                ratingEl.attr('href', 'http://ratings.food.gov.uk/');
            } else {
                ratingEl.attr('data-value', result.rating);
                ratingEl.css('backgroundImage', 'url(http://ratings.food.gov.uk/images/scores/'+imageSize+'/'+result.image+')');
                ratingEl.attr('href',result.link);
            }

            done();
        };

    }

};


var ajaxLoader = 'data:image/gif;base64,R0lGODlhEAAQAPIAAP///wAAAMLCwkJCQgAAAGJiYoKCgpKSkiH+GkNyZWF0ZWQgd2l0aCBhamF4bG9hZC5pbmZvACH5BAAKAAAAIf8LTkVUU0NBUEUyLjADAQAAACwAAAAAEAAQAAADMwi63P4wyklrE2MIOggZnAdOmGYJRbExwroUmcG2LmDEwnHQLVsYOd2mBzkYDAdKa+dIAAAh+QQACgABACwAAAAAEAAQAAADNAi63P5OjCEgG4QMu7DmikRxQlFUYDEZIGBMRVsaqHwctXXf7WEYB4Ag1xjihkMZsiUkKhIAIfkEAAoAAgAsAAAAABAAEAAAAzYIujIjK8pByJDMlFYvBoVjHA70GU7xSUJhmKtwHPAKzLO9HMaoKwJZ7Rf8AYPDDzKpZBqfvwQAIfkEAAoAAwAsAAAAABAAEAAAAzMIumIlK8oyhpHsnFZfhYumCYUhDAQxRIdhHBGqRoKw0R8DYlJd8z0fMDgsGo/IpHI5TAAAIfkEAAoABAAsAAAAABAAEAAAAzIIunInK0rnZBTwGPNMgQwmdsNgXGJUlIWEuR5oWUIpz8pAEAMe6TwfwyYsGo/IpFKSAAAh+QQACgAFACwAAAAAEAAQAAADMwi6IMKQORfjdOe82p4wGccc4CEuQradylesojEMBgsUc2G7sDX3lQGBMLAJibufbSlKAAAh+QQACgAGACwAAAAAEAAQAAADMgi63P7wCRHZnFVdmgHu2nFwlWCI3WGc3TSWhUFGxTAUkGCbtgENBMJAEJsxgMLWzpEAACH5BAAKAAcALAAAAAAQABAAAAMyCLrc/jDKSatlQtScKdceCAjDII7HcQ4EMTCpyrCuUBjCYRgHVtqlAiB1YhiCnlsRkAAAOwAAAAAAAAAAAA=='; 



var JustEat = {
    processSearchResult: function(el, done) {

        console.log('processSearchResult');

        var address = normalizeAddress($(el).find('p.address').text());
        var name = $(el).find('h2.name').text().trim();
        var id = $(el).find('h2.name a').attr('data-restaurant-id');

        console.log(name,address);

        var ratingEl = $('<a class="hygieneRating hygieneRatingLoading"></a>');
        $(el).find('p.viewMenu, p.preOrderButton').append(ratingEl);

        lookup(id, name,address, SitesCommon.updateBadgeCallback('small',ratingEl, done));   
    },

    processMenuPage: function(i, el) {

        var address = normalizeAddress($('.restInfoAddress').text());
        var name = $('.restaurant-name').text().trim();
        var id = $('#RestaurantId').val();

        var ratingEl = $('<a class="hygieneRatingBig hygieneRatingLoading"></a>');
        $('#divBasketUpdate').prepend(ratingEl);

        lookup(id, name,address, SitesCommon.updateBadgeCallback('large',ratingEl));   
    },

    sort: function(){

        if(window.location.href.indexOf('?so=hygiene') === -1)
            return;

        elementList = [];
        $(".restaurant").each(function(i, e){
            var hygineScore = $(e).find(".hygieneRating").attr('data-value');
            var userScore = $(e).find('meta[itemprop=ratingValue]').attr('content');
            var combinedScore = hygineScore * 1000 + userScore;
            elementList.push({rating:combinedScore, element:e, parent:$(e).parent()});
            $(e).remove();
        });
        elementList.sort(function(a,b){
            return b.rating - a.rating;
        });
        for (i = 0; i < elementList.length; i++){
            e = elementList[i];
            e.parent.append(e.element);
        }
    },


    addSortOption: function(i, el) {

        if(window.location.href.indexOf('?so=hygiene') !== -1) {

            $('#sort .options ul li.selected').removeClass('selected');
            $('#sort .options ul').append('<li class="selected"><span class="item">Hygiene Rating</a></li>');           
        }else{

            $('#sort .options ul').append('<li><a class="item" href="'+window.location.pathname+'?so=hygiene">hygiene Rating</a></li>')
        }
    },

    initialize: function() {
        var css = '';
        css += '.hygieneRatingLoading { background-image: url('+ajaxLoader+'); backgound-repeat: no-repeat !important }'
        css += '.hygieneRating { position: absolute; width: 80px !important; background-color: white !important; min-height: 38px; right: 9px; top: 52px; background-position: center; }';
        css += '.hygieneRatingBig { display: block; width: 100% !important; min-height: 150px; background-position: center; background-repeat: no-repeat }';

        $('head').append('<style>' + css + '</style>');

        this.addSortOption();
        async.eachLimit($('.restaurantInner').get(), 5,  this.processSearchResult, this.sort);
        $('.restaurant-info-detail').each(this.processMenuPage);

    }
};


var HungryHouse = {

    processMenuPage: function() {

        var ratingEl = $('<a class="hygieneRatingBig hygieneRatingLoading"></a>');
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

    addRatingToSearchResult: function(el, done) {

        var id = el.find('.restPageLink').attr('href').substr(1);

        var ratingEl = $('<a class="hygieneRating hygieneRatingLoading"></a>');
        el.find('.restsRestInfo').append(ratingEl);

        HungryHouse.lookupFromId(id, function(err, name, address) {          
            lookup(id, name,address, SitesCommon.updateBadgeCallback('small',ratingEl,done));   
        });
    },

    //Hungry house loads stuff with ajax so we have to continuously check
    pollForNewSearchItems: function() {
        
        var newResults = [];

        $('#searchContainer .restaurantBlock').each(function(i,el) {
            if($(el).find('.hygieneRating').length === 0)            
                newResults.push($(el));          
        });
        
        if(newResults.length===0)
            return;
        
        console.log('Found ', newResults.length, 'restraunts withour rating');
        async.eachLimit(newResults, 5, HungryHouse.addRatingToSearchResult, window.location.hash === '#hygiene' ? HungryHouse.sortResults : null);
    },
    
    sortResults:  function(){

        
        $('.restsResNotification').remove();
        elementList = [];
        $(".restaurantBlock").each(function(i, e){
            var hygineScore = parseInt($(e).find(".hygieneRating").attr('data-value'),0);
            var userScore = parseInt(($(e).find('.restsRating div').css('width') || '0px').replace(/[px\%]+/,''),10);
            var combinedScore = hygineScore * 1000 + userScore;
            console.log('Score:', $(e).find('h2').text(), hygineScore, userScore, combinedScore);
            elementList.push({rating:combinedScore, element:e, parent:$(e).parent()});
            $(e).remove();
        });
        elementList.sort(function(a,b){
            return b.rating - a.rating;
        });
        for (i = 0; i < elementList.length; i++){
            e = elementList[i];
            e.parent.append(e.element);
        }
    },

    
    addSortOption: function() {
        var a = $('<a href="'+window.location.href+'#hygiene">Hygiene Rating</a>');
        $('#sort-form').append('   |   ');
        $('#sort-form').append(a);
        
        if(window.location.hash==='#hygeine') {
            $('#sort-form a').removeClass('active');
            a.addClass('active');
        }
        
        a.click(function(){
            $('#sort-form a').removeClass('active');
            a.addClass('active');
            HungryHouse.sortResults();
        });
        
        
    },

    initialize: function() {
        var css = '';
        css += '.hygieneRatingLoading { background-image: url('+ajaxLoader+'); }'
        css += '.restsRestStatus { top: -5px !important }';
        css += '.hygieneRating { display: block; position: relative; float: right; width: 120px !important; min-height: 66px !important; background-position: center; background-repeat: no-repeat; right: 0px; top: -10px;}';
        css += '.hygieneRatingBig { display: block; width: 100% !important; min-height: 150px; background-position: center; background-repeat: no-repeat }';

        $('head').append('<style>' + css + '</style>');

        $(this.addSortOption);
        $('#website-restaurant-container').each(this.processMenuPage);
        setInterval(this.pollForNewSearchItems,500);
    }
};


try {
    switch (window.location.host){
        case 'www.just-eat.co.uk':
            JustEat.initialize();
            JustEat.sort();
            break;
        case 'hungryhouse.co.uk':
            HungryHouse.initialize();
            break;
    }
}catch(e) {
    console.error(e.message, e.stack);
}

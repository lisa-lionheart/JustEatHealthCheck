// ==UserScript==
// @name         Just Eat Hygine Check
// @namespace    https://github.com/lisa-lionheart/JustEatHealthCheck
// @version      0.1
// @description  enter something useful
// @author       Lisa Croxford
// @match        https://www.just-eat.co.uk/*, http://www.just-eat.co.uk/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==


function normalizeBuisnessName(name) {
    name = name.toLowerCase();
    name = name.replace('&', 'and');
    name = name.replace(' restraunt', '');
    
    return name;
}

function normalizeAddress(address) {
  
    address = address.trim().replace('\n','').split(', ').map(function(line){ return line.trim(); });

    var street = address[0].replace('\'','');
    var postCode = address[address.length-1].replace(/ \(.+\)/, '');

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




function lookup(id, name, address, done) {
    
    var result = localStorage.getItem(id);
    if(result && result !== 'undefined') {
       done(null, JSON.parse(result));
    } else {
        lookupNoCache(name,address, function(err,result) {
            
            if(result) {
                localStorage.setItem(id, JSON.stringify(result));
            }
            done(err,result);
        });
    }
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

        return  callApi('Establishments',{address:streetQuery}, function(err, data) {

            if(err)
                return done(err);
            
            if(data.establishments.length !== 0) {
                return  parseResult(name,address, data,done);
            }

            console.log('Failed to find match for', name, 'querying',streetQuery);
            done(null,null);
        })
    });
}


function processSearchResult(i, el) {

    var address = normalizeAddress($(el).find('p.address').text());
    var name = $(el).find('h2.name').text().trim();
    var id = $(el).find('h2.name a').attr('data-restaurant-id');

    var ratingEl = $('<a class="hygineRating loading"></a>');
    $(el).find('p.viewMenu, p.preOrderButton').append(ratingEl);

    lookup(id, name,address, function(err, result) {
        ratingEl.removeClass('loading');
        
        if(err) {
            ratingEl.text('Ooops. something went wrong');   
            return;
        }

        if(result === null) {
            ratingEl.addClass('unrated');
            ratingEl.text('Manual search');   
            ratingEl.attr('href', 'http://ratings.food.gov.uk/enhanced-search/en-GB/%5E/'+address[2]+'/Relevance/0/%5E/%5E/1/1/10');
        } else {
            ratingEl.css('backgroundImage', 'url(http://ratings.food.gov.uk/images/scores/small/'+result.image+')');
            ratingEl.attr('href',result.link);

        }

    });   
}

function processMenuPage(i, el) {
    
    var address = normalizeAddress($('.restInfoAddress')[0].innerText.split(', '));
    var name = $('.restaurant-name')[0].innerText;
    var id = $('#RestaurantId').val();
    
    var ratingEl = $('<a class="hygineRatingBig loading"></a>');
    $('#divBasketUpdate').prepend(ratingEl);

    lookup(id, name,address, function(err, result) {
        ratingEl.removeClass('loading');
        
        if(err) {
            ratingEl.text('Ooops. something went wrong');   
            return;
        }

        if(result === null) {
            ratingEl.addClass('unrated');
            ratingEl.text('Manual search');   
            ratingEl.attr('href', 'http://ratings.food.gov.uk/enhanced-search/en-GB/%5E/'+address[2]+'/Relevance/0/%5E/%5E/1/1/10');
        } else {
            ratingEl.css('backgroundImage', 'url(http://ratings.food.gov.uk/images/scores/large/'+result.image+')');
            ratingEl.attr('href',result.link);
        }

    });   
}


var css = '';
css += '.hygineRating { position: absolute; width: 80px !important; background-color: white !important; min-height: 38px; right: 9px; top: 52px; background-position: center; }';
css += '.hygineRatingBig { display: block; width: 100% !important; min-height: 150px; background-position: center; background-repeat: no-repeat }';


$('head').append('<style>' + css + '</style>');

$('.restaurantInner').each(processSearchResult);
$('.restaurant-info-detail').each(processMenuPage);


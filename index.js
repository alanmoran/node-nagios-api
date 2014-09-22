var async = require('async');
var request = require('request');
var argv = require('minimist')(process.argv.slice(2));
var cliTable = require('cli-table');
var colors = require('colors');
var nagiosServers = require('./conf.json');

var requestsQueue = [];
var problems = [];

var style = {};
var chars = {};
if (argv.rainbow) {
    style = {
        border: ['rainbow']
    };
}

if (argv.bare) {
    style = {
        'padding-left': 0,
        'padding-right': 0
    };
    chars = {
        'top': '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        'bottom': '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        'left': '',
        'left-mid': '',
        'mid': '',
        'mid-mid': '',
        'right': '',
        'right-mid': '',
        'middle': ' '
    };
}


var whichFunction;
if (argv.stats) {
    whichFunction = _processSumResults;
}
else if (argv.problems) {
    whichFunction = _processProblemResults;
}else{
    console.log("You must pass in either --stats or --problems");
    return;
}

for (var a in nagiosServers) {
    var siteName = a;
    var site = nagiosServers[siteName];
    var url = site.url + '/state';
    var requestPackage = {
        url: url,
        name: siteName
    };
    requestsQueue.push(async.apply(_submitRequest, requestPackage));
}

async.parallel(requestsQueue, function(err, results) {
    if(err){
        throw err;
    }

    whichFunction(results);
});



function _submitRequest(requestData, cb) {
    var url = requestData.url;
    var name = requestData.name;
    request(url, function(error, response, body) {
        if(!response){
            console.log(url + " returned an empty response. Check that nagios-api is running.");
            throw err;
        }
        if (!error && response.statusCode == 200) {
            return cb(null, {
                body: body,
                name: name
            });
        } else {
            return cb(null,{status: response.statusCode, name:name});
        }
    });
}

function _processSumResults(results) {
    var resultsTable = new cliTable({
        head: ['Site', 'Hosts', 'Services', 'Problems'],
        style: style,
        chars: chars
    });
    var totalHosts = 0,
        totalServices = 0,
        totalProblems = 0;

    for (var i = 0; i < results.length; i++) {
        var hostCount = 0,
            servicesCount = 0,
            problemsCount = 0;

        var siteName = results[i].name;
        var body = JSON.parse(results[i].body);
        var cluster = body.content;

        for (var a in cluster) {
            hostCount++;
            var services = cluster[a].services;
            for (var c in services) {
                servicesCount++;
                var serviceState = services[c].current_state;
                if (serviceState !== "0") {
                    problemsCount++;
                }
            }
        }
        totalHosts += hostCount;
        totalServices += servicesCount;
        totalProblems += problemsCount;

        resultsTable.push([siteName, hostCount, servicesCount, problemsCount]);
    }
    var sortedTable = resultsTable.sort();
    sortedTable.push(["TOTAL".red, totalHosts.toString().red, totalServices.toString().red, totalProblems.toString().red]);
    console.log(sortedTable.toString());
}


function _processProblemResults(results) {

    var resultsTable = new cliTable({
        head: ['Nagios Server', 'Host', 'Check', 'Message'],
        style: style,
        chars: chars
    });

    for (var i = 0; i < results.length; i++) {
        if(results[i].status){
            console.log('Something has gone wrong with :: '+ results[i].name);
            console.log('Status Code :: '+results[i].status);
            continue;
        }
        var siteName = results[i].name;
        var body = JSON.parse(results[i].body);
        var cluster = body.content;

        for (var a in cluster) {
            var services = cluster[a].services;
            for (var c in services) {
                var serviceState = services[c].current_state;
                if (serviceState !== "0") {
                    var serviceMessage = services[c].plugin_output;
                    resultsTable.push([siteName, a, c, serviceMessage]);
                }
            }
        }
    }

    var sortedTable = resultsTable.sort();
    console.log(sortedTable.toString());
}

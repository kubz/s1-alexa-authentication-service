var myState = '';
var myToken = '';

var http = require('http'),
    https = require('https'),
    fs = require('fs'),
    url = require('url'),
    qs = require('querystring'),
    request = require('request'),
    datastore = require('nedb');

var cred_db = new datastore( {filename: 'database/credentials.db'});
    
cred_db.loadDatabase(function(err){});

const { URL, URLSearchParams } = require('url');

var options = {
    key: fs.readFileSync('ssl/server.key'),
    cert: fs.readFileSync('ssl/server.crt'),
    ca: fs.readFileSync('ssl/intermediate.crt')
};

var mimeTypes = {
    "txt":  "text/plain",
    "html": "text/html",
    "css":  "text/css",
    "jpeg": "image/jpeg",
    "jpg":  "image/jpeg",
    "png":  "image/png",
    "js":   "application/javascript",
    "json": "application/json",
    "xml":  "application/xml"
};

var dirSpacesBeforeDate = 51;
var dirSpacesBeforeSize = 9;
var dirMonths = 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec'.split(',');

/*
http.createServer(function(req, res) {
    serveFiles(req, res);
}).listen(80);
*/

https.createServer(options, function(req, res) {
    serveFiles(req, res);
}).listen(443);

function serveFiles(req, res) {

    try{
        var path = url.parse(req.url).pathname;
        path = ('./' + path).replace('//', '/');

        req.on('error', function (e) {
            // General error, i.e.
            //  - ECONNRESET - server closed the socket unexpectedly
            //  - ECONNREFUSED - server did not listen
            //  - HPE_INVALID_VERSION
            //  - HPE_INVALID_STATUS
            //  - ... (other HPE_* codes) - server returned garbage
            console.log(e);
        });
          
        req.on('timeout', function () {
            // Timeout happend. Server received request, but not handled it
            // (i.e. doesn't send any response or it took to long).
            // You don't know what happend.
            // It will emit 'error' message as well (with ECONNRESET code).
          
        console.log('timeout');
        req.abort();
        });

        if (req.method == 'POST' && req.url.includes('login.html'))
        {
            var body = '';
            var post = '';

            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                post = qs.parse(body);
                console.log(post);

                var options = {
                    uri: 'https://' + post.server + '/web/api/v1.6/users/login',
                    method: 'POST',
                    json: {
                        username: post.username,
                        password: post.password
                    }
                }

                request(options, function (error, response, content) {

                    if (!error && response.statusCode == 200) {

                        console.log('Login successful');
                        myState = post.state;
                        myToken = content.token;
                        var newurl = post.redirect_uri + '?code=' + post.server + '|' + post.username +  '&state=' + post.state;

                        var cred = {
                            server: post.server,
                            username: post.username,
                            password: post.password,
                            token: content.token,
                            state: post.state 
                        };

                        // Find the user record. If not found, insert; if found, then update
                        cred_db.findOne( { server: post.server, username: post.username}, function (err, doc){
                            if (doc === null) {
                                cred_db.insert(cred, function(err, doc2) {  
                                    console.log('Inserted ' + doc2.username + '@' + doc2.server + ' with ID ' + doc2._id);
                                });                        
                            }
                            else {
                                cred_db.update( {_id: doc._id}, cred, {}, function (err, numReplaced) {
                                    console.log('Replace ' + numReplaced + ' record');
                                })
                            }
                        });
                        cred_db.persistence.compactDatafile();

                        var loc = {
                                Location: newurl
                        }

                        res.writeHead(301, loc);
                        res.end();
                        console.log('Sent code and state');
                    }
                    else {
                        console.log('Login failed');
                        
                        var result = '';
                        fs.readFile('./login.html', 'utf8', function (err,data) {
                            if (err) {
                              return console.log(err);
                            }

                            var retCode = (response === undefined ? '' : response.statusCode);
                            var retMessage = (response === undefined ? 'Server not available' : content.message);
                            
                            result = data.replace(/<!-- message -->/g, '<p style="color:red;">Error connecting to the SentinelOne server, please try again.<br/>Message: ' + retCode + ' - ' + retMessage + '</p>');
                            result = result.replace(/<!-- replace1 -->/g, '<input type="hidden" name="client_id" value="' + post.client_id + '">');
                            result = result.replace(/<!-- replace2 -->/g, '<input type="hidden" name="response_type" value="' + post.response_type + '">');
                            result = result.replace(/<!-- replace3 -->/g, '<input type="hidden" name="state" value="' + post.state + '">');
                            result = result.replace(/<!-- replace4 -->/g, '<input type="hidden" name="scope" value="' + post.scope + '">');
                            result = result.replace(/<!-- replace5 -->/g, '<input type="hidden" name="redirect_uri" value="' + post.redirect_uri + '">');

                            result = result.replace('placeholder="e.g. servername.sentinelone.net"', 'value="' + post.server + '"');
                            result = result.replace('name="username" value="', 'name="username" value="' + post.username + '"');
                            result = result.replace('name="password" value="', 'name="password" value="' + post.password + '"');
                            
                            res.writeHead(200, {'Content-Type': 'text/html'});
                            // var fileStream = fs.createReadStream('./loginm.html');
                            // fileStream.pipe(res);
                            res.write(result);
                            res.end();
                    
                          });

                    }
                     
                })
               
            });

            return;
        }

        if (req.method == 'POST' && req.url.includes('credentials.html'))
        {
        console.log('In POST Credentials');

            var body = '';
            var post = '';

            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                post = qs.parse(body);

                var myServer = '';
                var myUsername = '';

                if (post.code !== undefined)
                {
                    myServer = post.code.substring(0, post.code.indexOf('|'));
                    myUsername = post.code.substring(post.code.indexOf('|')+1);
                }
                else
                {
                    myServer = post.refresh_token.substring(0, post.refresh_token.indexOf('|'));
                    myUsername = post.refresh_token.substring(post.refresh_token.indexOf('|')+1);
                }

                console.log('myServer: ' + myServer); 
                console.log('myUsername ' + myUsername);

                var newurl = post.redirect_uri + '?access_token=' + myToken + '&token_type=Bearer&state=' + myState;
                // console.log('New URL: ' + newurl);
                var loc = {
                    'Location': newurl,
                    'Content-Type': 'application/json'
                }

                cred_db.findOne( { server: myServer, username: myUsername}, function (err, doc){
                    console.log('doc.token: ' + doc.token);
                    myToken = doc.token;
                    myState = doc.state;

                    var resData = {
                        "access_token": doc.server + '|' + myToken,
                        "token_type": "bearer",
                        // "expires_in": 120,
                        "refresh_token": doc.server + '|' + doc.username,
                        "scope": "profile",
                        "state": myState
                    };

                    // console.log(JSON.stringify(resData));
                    res.writeHeader(200, { 'Content-Type' : 'application/json' });
                    res.write(JSON.stringify(resData));
                    req.setTimeout(8000);
                    res.end();
                    console.log('Sent credentials');
                });      
            
            });

            return;
        }

        // prevent access to file starting with .
        var parts = path.split('/');
        if(parts[parts.length-1].charAt(0) === '.')
            return sendForbidden(req, res, path);

        fs.stat(path, function(err, stats) {
            if(err) return sendNotFound(req, res, path);

            if(stats.isDirectory()) {
                if(path.charAt(path.length-1) !== '/') {
                    return sendRedirect(req, res, path + '/');
                }

                fs.stat(path + 'index.html', function(err2, stats2) {
                    // if(err2) return sendDirectory(req, res, path);
					if(err2) return sendForbidden2(req, res, path);
                    return sendFile(req, res, path + '/index.html');
                });
            }
            else
                return sendFile(req, res, path);
        });
    }
    catch (err)
    {
        console.log(err);
    }
}

function escapeHtml(value) {
    return value.toString().
        replace('<', '&lt;').
        replace('>', '&gt;').
        replace('"', '&quot;');
}

function zeroFill(value) {
    return ((value < 10) ? '0' : '') + value;
}

function convertSize(value) {
    if(value > 1000000000) return ((value*0.000000001) | 0) + 'G';
    if(value > 1000000) return ((value*0.000001) | 0) + 'M';
    if(value > 10000) return ((value*0.001) | 0) + 'K';
    return '' + value;
}

function sendFile(req, res, path) {
    var extension = path.split('.').pop();
    var contentType = mimeTypes[extension] || 'text/plain';

    if (path.includes('login.html'))
    {
        console.log('Serving: ' + path);

        var fullUrl = req.protocol + '://' + req.hostname + req.url;

        var alexaUrl = new URL(fullUrl);

        var client_id =         (alexaUrl.searchParams.get('client_id') === null ? 'none' : alexaUrl.searchParams.get('client_id'));
        var response_type =     (alexaUrl.searchParams.get('response_type') === null ? 'none' : alexaUrl.searchParams.get('response_type'));
        var state =             (alexaUrl.searchParams.get('state') === null ? 'none' : alexaUrl.searchParams.get('state'));
        var scope =             (alexaUrl.searchParams.get('scope') === null ? 'none' : alexaUrl.searchParams.get('scope'));
        var redirect_uri =      (alexaUrl.searchParams.get('redirect_uri') === null ? 'none' : alexaUrl.searchParams.get('redirect_uri'));

        /*
        console.log('client_id: ' + client_id);
        console.log('response_type: ' + response_type);
        console.log('state: ' + state);
        console.log('scope: ' + scope);
        console.log('redirect_uri: ' + redirect_uri);
        */

        fs.readFile('./login.html', 'utf8', function (err,data) {
          if (err) {
            return console.log(err);
          }
            var result = data.replace(/<!-- replace1 -->/g, '<input type="hidden" name="client_id" value="' + client_id + '">');
            result = result.replace(/<!-- replace2 -->/g, '<input type="hidden" name="response_type" value="' + response_type + '">');
            result = result.replace(/<!-- replace3 -->/g, '<input type="hidden" name="state" value="' + state + '">');
            result = result.replace(/<!-- replace4 -->/g, '<input type="hidden" name="scope" value="' + scope + '">');
            result = result.replace(/<!-- replace5 -->/g, '<input type="hidden" name="redirect_uri" value="' + redirect_uri + '">');

            // fs.writeFile('./loginx.html', result, 'utf8', function (err) {
            //     if (err) return console.log(err);
            // });

            res.writeHead(200, {'Content-Type': contentType});
            res.write(result);
            res.end();

        });

        // res.writeHead(200, {'Content-Type': contentType});
        // var fileStream = fs.createReadStream('./loginx.html');
        // fileStream.pipe(res);
   }
   else if (path.includes('credentials'))
   {
            console.log('Serving: ' + path);
    
            var fullUrl = req.protocol + '://' + req.hostname + req.url;
    
            var alexaUrl = new URL(fullUrl);
    
            console.log('Credential URL: ' + fullUrl);
    
            res.writeHead(200, {'Content-Type': contentType});
            var fileStream = fs.createReadStream('./loginx.html');
            fileStream.pipe(res);
    
   }
    else
    {
        res.writeHead(200, {'Content-Type': contentType});
        var fileStream = fs.createReadStream(path);
        fileStream.pipe(res);
    }
}

function sendRedirect(req, res, path) {
    res.writeHead(301, {
        'Content-Type': 'text/html',
        'Location': path
    });
    res.end();
}

function sendServerError(req, res, error) {
    console.log('500 Internal Server Error: ' + error);

    res.writeHead(500, {'Content-Type': 'text/html'});
    res.writeo('<!DOCTYPE html>\n');
    res.write('<html><head>\n');
    res.write('<title>500 Internal Server Error</title>\n');
    res.write('</head><body>\n');
    res.write('<h1>500 Internal Server Error</h1>\n');
    res.write('<pre>' + escapeHtml(error) + '</pre>\n');
    res.write('</body></html>\n');
    res.end();
}

function sendForbidden(req, res, path) {
    console.log('403 Forbidden: ' + path);

    res.writeHead(403, {'Content-Type': 'text/html'});
    res.write('<!DOCTYPE html>\n');
    res.write('<html><head>\n');
    res.write('<title>403 Forbidden</title>\n');
    res.write('</head><body>\n');
    res.write('<h1>403 Forbidden</h1>\n');
    res.write('<p>You don\'t have permission to access' + escapeHtml(path) + ' on this server.</p>\n');
    res.write('</body></html>\n');
    res.end();
}

function sendForbidden2(req, res, path) {
    console.log('403 Forbidden: ' + path);

    res.writeHead(403, {'Content-Type': 'text/html'});
    res.write('<!DOCTYPE html>\n');
    res.write('<html><head>\n');
    res.write('<title>403 Forbidden</title>\n');
    res.write('</head><body>\n');
    res.write('<h1>403 Forbidden</h1>\n');
    res.write('<p>You don\'t have permission to access resources on this server.</p>\n');
    res.write('</body></html>\n');
    res.end();
}

function sendNotFound(req, res, path) {
    console.log('404 Not Found: ' + path);

    res.writeHead(404, {'Content-Type': 'text/html'});
    res.write('<!DOCTYPE html>\n');
    res.write('<html><head>\n');
    res.write('<title>404 Not Found</title>\n');
    res.write('</head><body>\n');
    res.write('<h1>404 Not Found</h1>\n');
    res.write('<p>The requested URL ' + escapeHtml(path) + ' was not found on this server.\n');
    res.write('</body></html>\n');
    res.end();
}

function sendDirectory(req, res, path) {
    fs.readdir(path, function(err, files) {
        if(err) return sendServerError(req, res, err);

        if(files.length === 0)
            return sendDirectoryIndex(req, res, path, []);

        var remaining = files.length;
        files.forEach(function(filename, idx) {
            fs.stat(path + '/' + filename, function(err, stats) {
                if(err) return sendServerError(req, res, err);

                files[idx] = {
                    name: files[idx],
                    date: stats.mtime,
                    size: '-'
                };

                if(stats.isDirectory()) files[idx].name += '/';
                else files[idx].size = stats.size;

                if(--remaining === 0)
                    return sendDirectoryIndex(req, res, path, files);

            });
        });
    });
}

function sendDirectoryIndex(req, res, path, files) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write('<!DOCTYPE html>\n');
    res.write('<html><head>\n');
    res.write('<title>Index of ' + escapeHtml(path) + '</title>\n');
    res.write('</head><body>\n');
    res.write('<h1>Index of ' + escapeHtml(path) + '</h1>\n');
    res.write('<hr><pre>\n');

    res.write('<a href="../">../</a>\n');


    files.forEach(function(file, idx) {
        var name = escapeHtml(file.name),
            displayName = name.substr(0, dirSpacesBeforeDate-1),
            spBeforeDate = dirSpacesBeforeDate - displayName.length;

        res.write('<a href="' + name + '">' + displayName + '</a>');
        while(--spBeforeDate) res.write(' ');

        var day = zeroFill(file.date.getDate()),
            month = dirMonths[file.date.getMonth()],
            hours = zeroFill(file.date.getHours()),
            min = zeroFill(file.date.getMinutes());

        var date = day + '-' + month + '-' + file.date.getFullYear() +
                   ' ' + hours + ':' + min;
        res.write(date);

        var size = convertSize(file.size),
            spBeforeSize = dirSpacesBeforeSize - size.length;

        while(spBeforeSize--) res.write(' ');
        res.write(size + '\n');
    });

    res.write('</pre><hr></body></html>\n');
    res.end();
}

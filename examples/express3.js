var express = require('express');
var http = require('http');
var githubAuth = require('github-auth');
var gh = githubAuth('appid', 'appsecret', {
	organization: 'myorganization',
	team: 'my-team',
	credentials: {
		user: 'someuser',
		pass: 'somepassword'
	}
});

var app = express();

app.set('port', process.env.PORT || 3000);
app.use(gh.authenticate);
app.use(app.router);

app.get('/login', gh.login);

app.get('*', function(req, res, next) {
	if (!req.github) return res.send('<a href="/login">Please login</a>');
	if (!req.github.authenticated) return res.send(404, 'YOU SHALL NOT PASS');
	next();
});

app.get('/', function(req, res) {
	res.send('<h2>HI!</h2>');
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

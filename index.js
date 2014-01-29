var routilCookie = require('routil-cookie');
var url = require('url');
var request = require('request');
var async = require('async');
var cookieSign = require('cookie-signature');

var getCookie = routilCookie.getCookie;
var setCookie = routilCookie.setCookie;
var cookieName = 'gh_uname';

var redirect = function(url, response) {
	response.statusCode = 302;
	response.setHeader('Location', url);
	response.end();
};

module.exports = function(clientId, clientSecret, config) {
	var scope = (config.team || config.organization)  ? 'user' : 'public';
	var secret = config.secret || 'asdasd123123';
	var userAgent = config.ua || 'github-auth';

	var isUser = function(accessToken, callback) {
		request('https://api.github.com/user?access_token='+accessToken, {
			headers: {
				'User-Agent': userAgent
			}
		}, function(err, res, body) {
			if (err) return callback(err);

			var json;
			try { json = JSON.parse(body); }
			catch(e) { 
				return callback(new Error(body), null);
			}
			callback(null, config.users.indexOf(json.login) !== -1, json.login);
		});
	};

	var isInTeam = function(accessToken, callback) {
		if (!config.organization) return callback(new Error('The organization is required to validate the team.'));
		if (!config.team) return callback(new Error('The team is required.'));
		request('https://api.github.com/user/teams?access_token=' + accessToken, {
			headers: {
				'User-Agent': userAgent
			}
		}, function(err, res, body) {
			if (err) return callback(err);

			var json;
			try { json = JSON.parse(body); }
			catch(e) { 
				return callback(new Error(body), null);
			}

			if (!Array.isArray(json)) return callback(null, false);
			var teamNames = json.map(function(obj) { return obj.slug; });
			var orgLogins = json.map(function(obj) { return obj.organization.login; });
			var authorized = teamNames.indexOf(config.team) !== -1 && orgLogins.indexOf(config.organization) !==1;

			callback(null, authorized, config.organization);
		});
	};

	var isInOrganization = function(accessToken, callback) {
		request('https://api.github.com/user/orgs?access_token=' + accessToken, {
			headers: {
				'User-Agent': userAgent
			}
		}, function(err, res, body) {
			if (err) return callback(err);

			var json;
			try { json = JSON.parse(body); }
			catch(e) { 
				return callback(new Error(body), null);
			}

			if (!Array.isArray(json)) return callback(null, false);
			var orgLogins = json.map(function(obj) { return obj.login; });
			var authorized = orgLogins.indexOf(config.organization) !==1;

			callback(null, authorized, config.team);
		});
	};


	return function(req, res, next) {
		var cookie = getCookie(req, cookieName);
		var val = cookie ? cookieSign.unsign(cookie, secret): false;
		if (val) return next();
		var u = url.parse(req.url, true);
		if (u.query.code) {
			request.post('https://github.com/login/oauth/access_token',	{
				headers: {
					'User-Agent': userAgent
				},
				form: {
					client_id: clientId,
					client_secret: clientSecret,
					code: u.query.code
				}
			}, function(err, response, body) {
				var resp = url.parse('/?'+body, true);
				var accessToken = resp.query.access_token;
				var checks = [];

				if (config.users) checks.push(function(cb) { isUser(accessToken, cb); });
				if (config.team) checks.push(function(cb) { isInTeam(accessToken, cb); });
				if (config.team) checks.push(function(cb) { isInOrganization(accessToken, cb); });

				async.parallel(checks, function(err, results) {
					if (err) return next(err);
					if (results.length === 0) return next(new Error('You have to add either users, team, or organizations to the config'));

					var auth = true;
					results.forEach(function(el) {
						if (!el[0]) auth = false;
					});

					if (auth) {
						setCookie(res, cookieName, cookieSign.sign('blah', secret));
						next();
					} else {
						response.statusCode = 403;
						res.end('User not authorized');
					}
				});
			});
		} else {
			var ghUrl = 'https://github.com/login/oauth/authorize?client_id='+clientId+ '&scope=' + scope;
			if (config.notLoggedIn) return config.notLoggedIn(req, res, ghUrl);
			redirect(ghUrl, res);
		}
	};
};


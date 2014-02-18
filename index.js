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
	var scope = (config.team && !config.credentials)  ? 'user' : 'public';
	var secret = config.secret || 'asdasd123123';
	var userAgent = config.ua || 'github-auth';

	var getUser = function(accessToken, callback) {
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
			callback(null, json.login);
		});
	};

	var teamId;
	var getTeamId = function(cb) {
		request('https://api.github.com/orgs/'+ config.organization + '/teams',{
			headers: {
				'User-Agent': userAgent
			},
			auth: {
				user: config.credentials.user,
				pass: config.credentials.pass
			}
		}, function(err, res, body) {
			if (err) return cb(err);
			if (res.statusCode >= 300) return cb(new Error('Bad credentials'));
			var teams;
			try { teams = JSON.parse(body); }
			catch(e) { 
				return cb(new Error(body), null);
			}

			var teamId = teams.filter(function(x) {return x.name === config.team;})[0].id;
			cb(null, teamId);
		});
	};

	var isInTeam = function(accessToken, ghusr, callback) {
		if (!config.organization) return callback(new Error('The organization is required to validate the team.'));
		if (!config.team) return callback(new Error('The team is required.'));

		if (config.credentials) {
			getTeamId(function(err, tid) {
				if (err) return callback(err);
				getUsersOnTeam(tid, function(err, users) {
					if (err) return callback(err);
					callback(null, users.indexOf(ghusr) !== -1);
				});
			});
		} else {
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
				var authorized = teamNames.indexOf(config.team) !== -1 && orgLogins.indexOf(config.organization) !== -1;

				callback(null, authorized);
			});
		}
		
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
			var authorized = orgLogins.indexOf(config.organization) !== -1;

			callback(null, authorized);
		});
	};

	var lastGhUpdate = 0;
	var authUsers = [];
	var tenMinutes = 1000*60*10;

	var getUsersOnTeam = function(teamId, cb) {
		if ((new Date().getTime() - lastGhUpdate) < tenMinutes) return cb(null, authUsers);
		var opts = {
			url: 'https://api.github.com/teams/'+teamId+'/members', 
			headers: {
				'User-Agent': userAgent 
			},
			auth: {
				'user': config.credentials.user,
				'pass': config.credentials.pass
			}
		};
		lastGhUpdate = new Date().getTime();
		request.get(opts, function(err, res, body) {
			if (err) return cb(err);
			if (res.statusCode >= 300) return cb(new Error('Bad credentials'));
			var usrsObj = JSON.parse(body);
			authUsers = usrsObj.map(function(x) { return x.login; });
			cb(null, authUsers);
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
				if (err) return next(err);
				var resp = url.parse('/?'+body, true);
				var accessToken = resp.query.access_token;

				getUser(accessToken, function(err, ghusr) {
					if (err) return next(err);

					var checks = [];
					if (config.users) checks.push(function(cb) { cb(null, config.users.indexOf(ghusr) !== -1); });
					if (config.team) checks.push(function(cb) { isInTeam(accessToken, ghusr, cb); });
					if (config.organization) checks.push(function(cb) { isInOrganization(accessToken, cb); });

					async.parallel(checks, function(err, results) {
						if (err) return next(err);
						if (results.length === 0) return next(new Error('You have to add either users, team, or organizations to the config'));

						var auth = true;
						var uname;
						results.forEach(function(el) {
							if (!el) auth = false;
						});

						if (auth) {
							setCookie(res, cookieName, cookieSign.sign(ghusr, secret));
							next();
						} else {
							response.statusCode = 403;
							res.end('User not authorized');
						}
					});
				});
				
			});
		} else {
			var ghUrl = 'https://github.com/login/oauth/authorize?client_id='+clientId+ '&scope=' + scope;
			if (config.notLoggedIn) return config.notLoggedIn(req, res, ghUrl);
			redirect(ghUrl, res);
		}
	};
};


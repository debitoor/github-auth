const routilCookie = require('routil-cookie');
const url = require('url');
const async = require('async');
const cookieSign = require('cookie-signature');
const deepcopy = require('deepcopy');
const rrs = require('request-retry-stream');

const getCookie = routilCookie.getCookie;
const setCookie = routilCookie.setCookie;
const cookieName = 'gh_uname';

var redirect = function (url, response) {
	response.statusCode = 302;
	response.setHeader('Location', url);
	response.end();
};

var toFunction = function (str) {
	return function () {
		return str;
	};
};

var defaultRandomSecret = Math.random().toString();
var ghSecretState = Math.random().toString();

module.exports = function (clientId, clientSecret, config) {
	// We don't want to accidentally mutate the object we were passed.
	config = deepcopy(config);

	// GitHub enforces lowercase names for organizations and teams.
	// The checks later on are simplified by normalizing here.
	if (config.organization) {
		config.organization = config.organization.toLowerCase();
	}
	if (config.team) {
		config.team = config.team.toLowerCase();
	}

	var scope = ((config.team || config.organization) && !config.credentials) ? 'user' : 'public';
	var secret = config.secret || defaultRandomSecret;
	var userAgent = config.ua || 'github-auth';
	var redirectUri = config.redirectUri || '';
	var accessToken;

	if (typeof redirectUri !== 'function') redirectUri = toFunction(redirectUri);

	var getRequest = function (url, forceOauth, cb) {
		if (typeof forceOauth === 'function') {
			cb = forceOauth;
			forceOauth = false;
		}
		if (config.credentials && !forceOauth) {
			rrs.get({
				url,
				headers: {
					'User-Agent': userAgent
				},
				auth: {
					user: config.credentials.user,
					pass: config.credentials.pass
				},
				timeout: 10000
			}, cb);
		} else {
			rrs.get({
				//access_token removedfrom query parameter and is added to header
				url: url,
				headers: {
					'User-Agent': userAgent,
					'Authorization': 'token ' + accessToken
				},
				timeout: 10000
			}, cb);
		}
	};

	var getUser = function (callback) {
		getRequest('https://api.github.com/user', true, function (err, res, body) {
			if (err) return callback(err);
			var json;
			try {
				json = JSON.parse(body);
			}
			catch (e) {
				return callback(new Error(body), null);
			}
			if (typeof json.login !== 'string' || json.login === '') {
				return callback(new Error(`GitHub User has no login, ${body}`), null);
			}
			callback(null, json.login);
		});
	};

	var getTeamId = function (cb) {
		getRequest('https://api.github.com/orgs/' + config.organization + '/teams', function (err, res, body) {
			if (err) return cb(err);
			var teams;
			try {
				teams = JSON.parse(body);
			}
			catch (e) {
				return cb(new Error(body), null);
			}

			var teamId = teams.filter(function (x) {
				return x.name === config.team;
			})[0].id;
			cb(null, teamId);
		});
	};

	var isInTeam = function (ghusr, callback) {
		if (!config.organization) return callback(new Error('The organization is required to validate the team.'));
		if (!config.team) return callback(new Error('The team is required.'));

		if (config.credentials) {
			getTeamId(function (err, tid) {
				if (err) return callback(err);
				getUsersOnTeam(tid, function (err, users) {
					if (err) return callback(err);
					callback(null, users.indexOf(ghusr) !== -1);
				});
			});
		} else {
			rrs.get({
				//access_token removedfrom query parameter and is added to header				
				url: 'https://api.github.com/user/teams',
				headers: {
					'User-Agent': userAgent,
					'Authorization': 'token ' + accessToken
				},
				timeout: 10000
			}, function (err, res, body) {
				if (err) return callback(err);

				var json;
				try {
					json = JSON.parse(body);
				}
				catch (e) {
					return callback(new Error(body), null);
				}

				if (!Array.isArray(json)) return callback(null, false);
				var teamNames = json.map(function (obj) {
					return obj.slug;
				});
				var orgLogins = json.map(function (obj) {
					return obj.organization.login;
				});
				var authorized = teamNames.indexOf(config.team) !== -1 && orgLogins.indexOf(config.organization) !== -1;

				callback(null, authorized);
			});
		}

	};

	var isInOrganization = function (callback) {
		getRequest('https://api.github.com/user/orgs', function (err, res, body) {
			if (err) return callback(err);

			var json;
			try {
				json = JSON.parse(body);
			}
			catch (e) {
				return callback(new Error(body), null);
			}

			if (!Array.isArray(json)) return callback(null, false);
			var orgLogins = json.map(function (obj) {
				return obj.login;
			});
			var authorized = orgLogins.indexOf(config.organization) !== -1;

			callback(null, authorized);
		});
	};

	var lastGhUpdate = 0;
	var authUsers = [];
	var tenMinutes = 1000 * 60 * 10;

	var getUsersOnTeam = function (teamId, cb) {
		if ((new Date().getTime() - lastGhUpdate) < tenMinutes) return cb(null, authUsers);
		lastGhUpdate = new Date().getTime();
		getRequest('https://api.github.com/teams/' + teamId + '/members', function (err, res, body) {
			if (err) return cb(err);
			var usrsObj = JSON.parse(body);
			authUsers = usrsObj.map(function (x) {
				return x.login;
			});
			cb(null, authUsers);
		});
	};

	var ghUrl = function (req) {
		return 'https://github.com/login/oauth/authorize?client_id=' + clientId + '&scope=' + scope +
			'&redirect_uri=' + redirectUri(req) + '&state=' + ghSecretState;
	};

	var cleanUrl = function (req) {
		var u = url.parse(req.url, true);
		delete u.search;
		delete u.query.code;
		delete u.query.state;
		return url.format(u);
	};
	var login = function (req, res, next) {
		redirect(ghUrl(req), res);
	};

	var logout = function (req, res, next) {
		setCookie(res, cookieName, '');
		next();
	};

	return {
		decodeCookie: function (cookie) {
			var val = cookie.match('(^|; )' + 'gh_uname' + '=([^;]*)');
			val = val[2];
			val = unescape(val);
			return cookieSign.unsign(val, secret) || null;
		},
		authenticate: function (req, res, next) {
			var cookie = getCookie(req, cookieName);
			var val = cookie ? cookieSign.unsign(cookie, secret) : false;
			var updateCode = function () {
				if (config.autologin) return redirect(ghUrl(req), res);
				delete req.github;
				return next();
			};
			req.github = {};
			if (val) {
				req.github.authenticated = true;
				req.github.user = val;
				return next();
			}
			var u = url.parse(req.url, true);
			if (!u.query.code || u.query.state !== ghSecretState) {
				return updateCode();
			}
			rrs.post('https://github.com/login/oauth/access_token', {
				headers: {
					'User-Agent': userAgent
				},
				form: {
					client_id: clientId,
					client_secret: clientSecret,
					code: u.query.code,
					state: ghSecretState
				},
				timeout: 10000
			}, function (err, response, body) {
				if (err) return next(err);
				var resp = url.parse('/?' + body, true);
				if (!resp.query.access_token) {
					return updateCode();
				}
				accessToken = resp.query.access_token;

				getUser(function (err, ghusr) {
					if (err) return next(err);

					var checks = [];
					if (config.users) checks.push(function (cb) {
						cb(null, config.users.indexOf(ghusr) !== -1);
					});
					if (config.team) checks.push(function (cb) {
						isInTeam(ghusr, cb);
					});
					if (config.organization) checks.push(function (cb) {
						isInOrganization(cb);
					});

					async.parallel(checks, function (err, results) {
						if (err) return next(err);
						if (results.length === 0) return next(new Error('You have to add either users, team, or organizations to the config'));

						var auth = results.every(function (el) {
							return el;
						});

						if (!auth) {
							req.github.authenticated = false;
							req.github.user = ghusr;
							if (config.autologin) return redirect(ghUrl(req), res);
							return next();
						}
						var opts = {};
						if (config.maxAge) opts.expires = new Date(Date.now() + config.maxAge);
						setCookie(res, cookieName, cookieSign.sign(ghusr, secret), opts);
						req.github.user = ghusr;
						req.github.authenticated = true;
						if (config.hideAuthInternals && (u.query.code || u.query.state)) {
							return redirect(cleanUrl(req), res);
						}
						next();
					});
				});
			});
		},
		login: login,
		logout: logout
	};
};


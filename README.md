# github-auth

A middleware for github authentication.

## Installation

You can install this module with npm

```
npm install github-auth
```

## Usage

You can use the middleware on a connect/express app like this.

```js
githubAuth = require('github-auth');

var config = {
	team: 'some-team',
	organization: 'my-company'
};
app.use(githubAuth('github app id', 'github app secret', config));
```
That will validate that the user belongs to the 'some-team' team of the 'my-company' organization on github.

You can also use a whitelist of users, like this.
```js
githubAuth = require('github-auth');

var config = {
	users: ['sorribas', 'mafintosh', 'octocat']
};
app.use(githubAuth('github app id', 'github app secret', config));
```

Another option is the `notLoggedIn` function. By default, the middleware will redirect you to
the github OAuth login page for the application. But that's not that user friendly, so there
is a callback function that can be set in the config parameter so that you can redirect the
user to your own login page and then give them the link to github. Example:

```js
var config = {
	users: ['sorribas', 'mafintosh', 'octocat'],
	notLoggedIn: function(req, res, ghurl) {
		res.render('login', {ghLoginUrl: ghurl});
	}
};
app.use(githubAuth('github app id', 'github app secret', config));
```

To get the users in a team with the github API you need the full write access on the user
profile, which is not really nice. You can avoid this by passing some github credentials 
with access to the team to the module so it uses basic HTTP auth.

```js
githubAuth = require('github-auth');

var config = {
	team: 'some-team',
	organization: 'my-company',
	credentials: {
		user: 'myghuser',
		pass: 'mypass'
	}
};
app.use(githubAuth('github app id', 'github app secret', config));

```

Also, you don't have to use this module with connect or express. You could just use it in your
regular node http server like this.

```js

http.createServer(funcition(request, response) {
	var config = {
		team: 'some-team',
		organization: 'my-company'
	};
	githubAuth('github app id', 'github app secret', config)(request, response, function(err) {
		if(!err) return response.end(err);

		// your http code here
	});
});

```

## Max age

You can add a `maxAge` key to the option object so that it will set it to the cookie used by the middleware.

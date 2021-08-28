function (user, context, callback) {
  // Require the Node.js packages that we are going to use.
  // Check this website for a complete list of the packages available:
  // https://auth0-extensions.github.io/canirequire/
  var axios = require('axios');
  var url = require('url');
  var uuidv4 = require('uuid');
  
  // Only execute this rule for the Office 365 SSO integration.
  if (context.clientID !== '{your clientId for Office365 integration on Auth0}') {
    return callback(null, user, context);
  }

  // If the user is already provisioned on Microsoft AD, we skip
  // the rest of this rule
  user.app_metadata = user.app_metadata || {};
  if (user.app_metadata.office365Provisioned) {
    return connectWithUser();
  }

  // Global variables that we will use in the different steps while
  // provisioning a new user.
  var token;
  var mailNickname = user.email.split('@')[0];
  var userPrincipalName = mailNickname + '@{your azure ad domain}';
  var uuid = uuidv4.v4();
  var immutableId = new Buffer(uuid).toString('base64');
  var userId;

  // All the steps performed to provision new Microsoft AD users.
  // The definition of each function are below.
  getAzureADToken()
  	.then(createAzureADUser)
  	.then(AssignLicense)
    .then(saveUserMetadata)
    .then(waitCreateDelay)
    .then(connectWithUser)
    .catch(callback);

  // Requests an Access Token to interact with Windows Graph API.
  function getAzureADToken() {
		var postData = new url.URLSearchParams();
    postData.append('client_id','{your Azure AD client id for Auth0 integration}');
    postData.append('client_secret','{your Azure AD client secret for Auth0 integration}');
    postData.append('grant_type','client_credentials');
    postData.append('scope','https://graph.microsoft.com/.default');
    return axios.post(
      'https://login.microsoftonline.com/{your Azure AD tenant id}/oauth2/v2.0/token',
      postData);
  }

  // Gets the Access Token requested above and assembles a new request
  // to provision the new Microsoft AD user.
  function createAzureADUser(response) {
    token = response.data.access_token;
    let config = {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    };
    let data = {
      "accountEnabled": true,
      "displayName": user.name,
      "mailNickname": mailNickname,
      "userPrincipalName": userPrincipalName,
      "onPremisesImmutableId": immutableId,
      "passwordProfile": {
        "password": immutableId,
        "forceChangePasswordNextSignIn": false
      },
      "usageLocation": "JP"
    };
    return axios.post('https://graph.microsoft.com/v1.0/users', data, config);
  }

  // Assign Office365 licenses
  function AssignLicense(response) {
    let config = {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    };

    let data = {
      "addLicenses": [
        {
          "disabledPlans": [],
          "skuId": "6fd2c87f-b296-42f0-b197-1e91e994b900"
        }
      ],
      "removeLicenses": []
    };
    
    return axios.post('https://graph.microsoft.com/v1.0/users/' + userPrincipalName + '/assignLicense', data, config);
  }
  // After provisioning the user and giving a license to them, we record
  // (on Auth) that this Google Workspace user has already been provisioned. We
  // also record the user's principal username and immutableId to properly
  // redirect them on future logins.
  function saveUserMetadata() {
    user.app_metadata = user.app_metadata || {};
    user.app_metadata.office365Provisioned = true;
    user.app_metadata.office365UPN = userPrincipalName;
    user.app_metadata.office365ImmutableId = immutableId;
    return auth0.users.updateAppMetadata(user.user_id, user.app_metadata);
  }

  // As mentioned, Windows Graph API needs around 10 seconds to finish
  // provisioning new users (even though it returns ok straight away)
  function waitCreateDelay() {
    return new Promise(function (resolve) {
      setTimeout(function() {
        resolve();
      }, 15000);
    });
  }

  // Adds the principal username and immutableId to the user object and ends
  // the rule.
  function connectWithUser() {
    user.upn = user.app_metadata.office365UPN;
    user.inmutableid = user.app_metadata.office365ImmutableId;
    
    return callback(null, user, context);
  }
}

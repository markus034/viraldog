(function () {
  'use strict';
  try {
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = function () {
        return Promise.resolve(false);
      };
      window.PublicKeyCredential.isConditionalMediationAvailable = function () {
        return Promise.resolve(false);
      };
      if (window.PublicKeyCredential.getClientCapabilities) {
        window.PublicKeyCredential.getClientCapabilities = function () {
          return Promise.resolve({
            conditionalCreate: false,
            conditionalGet: false,
            hybridTransport: false,
            passkeyPlatformAuthenticator: false,
            userVerifyingPlatformAuthenticator: false
          });
        };
      }
    }
    if (navigator.credentials) {
      const origGet = navigator.credentials.get ? navigator.credentials.get.bind(navigator.credentials) : null;
      navigator.credentials.get = function (options) {
        if (options && (options.publicKey || options.mediation === 'conditional' || options.mediation === 'required')) {
          // Retorna Promise pendente sem disparar a interface nativa do Windows Hello
          return new Promise(function () {});
        }
        return origGet ? origGet(options) : Promise.resolve(null);
      };
      navigator.credentials.create = function (options) {
        if (options && options.publicKey) {
          return new Promise(function () {});
        }
        return Promise.resolve(null);
      };
    }
  } catch (e) {}
})();

/**
 * Browser identity shared by every embedded browser session.
 *
 * Keep all advertised versions tied to Electron's real Chromium build. Google
 * rejects inconsistent clients (for example Chromium 124 claiming Chrome 136).
 */
const fallbackChromeVersion = '150.0.0.0'
const runtimeChromeVersion = process.versions.chrome || process.versions.chromium || fallbackChromeVersion
const chromeVersion = /^\d+(?:\.\d+){3}$/.test(runtimeChromeVersion)
  ? runtimeChromeVersion
  : fallbackChromeVersion
const chromeMajorVersion = chromeVersion.split('.')[0]

const chromeUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
const brands = [
  { brand: 'Not_A Brand', version: '99' },
  { brand: 'Chromium', version: chromeMajorVersion },
  { brand: 'Google Chrome', version: chromeMajorVersion },
]
const fullVersionList = [
  { brand: 'Not_A Brand', version: '99.0.0.0' },
  { brand: 'Chromium', version: chromeVersion },
  { brand: 'Google Chrome', version: chromeVersion },
]
const secChUa = brands
  .map(({ brand, version }) => `"${brand}";v="${version}"`)
  .join(', ')

const configuredSessions = new WeakSet()

function configureChromeSession(targetSession) {
  if (!targetSession || configuredSessions.has(targetSession)) return
  configuredSessions.add(targetSession)

  targetSession.setUserAgent(chromeUA)
  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }
    const browserHeaderNames = new Set([
      'user-agent',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'x-requested-with',
    ])
    for (const headerName of Object.keys(headers)) {
      if (browserHeaderNames.has(headerName.toLowerCase())) delete headers[headerName]
    }
    headers['User-Agent'] = chromeUA
    headers['Sec-CH-UA'] = secChUa
    headers['Sec-CH-UA-Mobile'] = '?0'
    headers['Sec-CH-UA-Platform'] = '"Windows"'
    delete headers['X-Requested-With']
    callback({ requestHeaders: headers })
  })
}

function getNavigatorPatchScript() {
  return `(function () {
    const UA = ${JSON.stringify(chromeUA)};
    const BRANDS = ${JSON.stringify(brands)};
    const FULL_VERSION_LIST = ${JSON.stringify(fullVersionList)};
    const FULL_VERSION = ${JSON.stringify(chromeVersion)};

    try {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => UA,
        configurable: true
      });
    } catch (error) {}

    try {
      if ('userAgentData' in navigator) {
        const userAgentData = {
          brands: BRANDS,
          mobile: false,
          platform: 'Windows',
          getHighEntropyValues: async (hints = []) => {
            const result = { brands: BRANDS, mobile: false, platform: 'Windows' };
            const values = {
              architecture: 'x86',
              bitness: '64',
              fullVersionList: FULL_VERSION_LIST,
              model: '',
              platformVersion: '10.0.0',
              uaFullVersion: FULL_VERSION
            };
            for (const hint of hints) {
              if (Object.prototype.hasOwnProperty.call(values, hint)) result[hint] = values[hint];
            }
            return result;
          },
          toJSON: () => ({ brands: BRANDS, mobile: false, platform: 'Windows' })
        };

        Object.defineProperty(navigator, 'userAgentData', {
          get: () => userAgentData,
          configurable: true
        });
      }
    } catch (error) {}
  })()`
}

module.exports = {
  brands,
  chromeMajorVersion,
  chromeUA,
  chromeVersion,
  configureChromeSession,
  fullVersionList,
  getNavigatorPatchScript,
  secChUa,
}

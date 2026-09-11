const crypto = require('crypto');

class SumsubService {
  constructor() {
    this.appToken = process.env.SUMSUB_APP_TOKEN || '';
    this.secretKey = process.env.SUMSUB_SECRET_KEY || '';
    this.levelName = process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';
    this.baseUrl = (process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com').replace(/\/+$/, '');
  }

  /**
   * Generates HMAC-SHA256 signature for Sumsub API requests.
   * HMAC_SHA256(secretKey, timestamp + method + path + body)
   */
  createSignature(timestamp, method, path, body = '') {
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(String(timestamp));
    hmac.update(method.toUpperCase());
    hmac.update(path);
    if (body) {
      hmac.update(typeof body === 'string' ? body : JSON.stringify(body));
    }
    return hmac.digest('hex');
  }

  /**
   * Generates an access token for Sumsub WebSDK.
   * POST /resources/accessTokens?userId=...&levelName=...
   */
  async getAccessToken(externalUserId, levelName = null) {
    const chosenLevel = levelName || this.levelName;
    const path = `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&ttlInSecs=3600&levelName=${encodeURIComponent(chosenLevel)}`;
    const ts = Math.floor(Date.now() / 1000);

    // If keys are placeholder or not provided, return helpful dev fallback
    if (!this.appToken || this.appToken.includes('your_sumsub') || !this.secretKey) {
      return {
        success: false,
        isDevFallback: true,
        token: `mock-sumsub-token-${externalUserId}-${Date.now()}`,
        userId: externalUserId,
        msg: 'Sumsub credentials not configured in back-end/.env. Using development preview.'
      };
    }

    const signature = this.createSignature(ts, 'POST', path);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'X-App-Token': this.appToken,
          'X-App-Access-Ts': String(ts),
          'X-App-Access-Sig': signature,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Sumsub getAccessToken error:', data);
        return {
          success: false,
          error: data.description || data.message || 'Sumsub token generation failed'
        };
      }

      return {
        success: true,
        token: data.token,
        userId: data.userId || externalUserId
      };
    } catch (err) {
      console.error('Sumsub getAccessToken exception:', err);
      return {
        success: false,
        error: err.message || 'Network error communicating with Sumsub API'
      };
    }
  }

  /**
   * Fetches applicant status from Sumsub API.
   * GET /resources/applicants/-;externalUserId=.../one
   */
  async getApplicantStatus(externalUserId) {
    if (!this.appToken || !this.secretKey || this.appToken.includes('your_sumsub')) {
      return {
        success: false,
        isDevFallback: true,
        reviewStatus: 'init'
      };
    }

    const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`;
    const ts = Math.floor(Date.now() / 1000);
    const signature = this.createSignature(ts, 'GET', path);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          'X-App-Token': this.appToken,
          'X-App-Access-Ts': String(ts),
          'X-App-Access-Sig': signature,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();
      const review = data.review || data.reviewResult || {};
      const reviewStatus = review.reviewStatus || data.reviewStatus;
      const reviewAnswer = review.reviewResult?.reviewAnswer || data.reviewResult?.reviewAnswer;

      return {
        success: response.ok,
        reviewStatus,
        reviewAnswer,
        data
      };
    } catch (err) {
      console.error('Sumsub getApplicantStatus exception:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Validates webhook signature sent by Sumsub.
   * Header: X-Payload-Digest or similar
   */
  validateWebhook(rawPayload, signature, algHeader = 'HMAC_SHA256_HEX') {
    if (!this.secretKey || !signature) {
      return false;
    }

    let algorithm = 'sha256';
    if (algHeader && algHeader.toUpperCase().includes('SHA1')) {
      algorithm = 'sha1';
    } else if (algHeader && algHeader.toUpperCase().includes('SHA512')) {
      algorithm = 'sha512';
    }

    const computedSignature = crypto
      .createHmac(algorithm, this.secretKey)
      .update(typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload))
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computedSignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch (e) {
      return computedSignature.toLowerCase() === signature.toLowerCase();
    }
  }
}

module.exports = new SumsubService();

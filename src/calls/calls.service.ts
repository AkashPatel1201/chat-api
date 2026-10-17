import { Injectable, Logger } from '@nestjs/common';
import agoraPkg from 'agora-token';

const { RtcTokenBuilder, RtcRole } = agoraPkg as any;

export interface AgoraTokenResponse {
  appId: string;
  token: string | null;
  channelName: string;
  uid: string;
  expireTime: number;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  // Agora App ID and Certificate from environment variables
  private get agoraAppId(): string {
    return process.env.AGORA_APP_ID || process.env.NEXT_PUBLIC_AGORA_APP_ID || '';
  }

  private get agoraAppCertificate(): string {
    return process.env.AGORA_APP_CERTIFICATE || '';
  }

  /**
   * Generate an Agora RTC token for Voice / Video call
   */
  generateToken(
    channelName: string,
    userId: string,
    role: 'publisher' | 'subscriber' = 'publisher',
  ): AgoraTokenResponse {
    const appId = this.agoraAppId;
    const appCertificate = this.agoraAppCertificate;

    // Token valid for 24 hours (86400 seconds)
    const expireTimeInSeconds = 86400;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

    const rtcRole =
      role === 'publisher'
        ? (RtcRole?.PUBLISHER ?? 1)
        : (RtcRole?.SUBSCRIBER ?? 2);

    let token: string | null = null;

    // If an App Certificate is configured and is a valid 32-char hex string, build secure token
    if (appId && appCertificate && appCertificate.length === 32) {
      try {
        token = RtcTokenBuilder.buildTokenWithUserAccount(
          appId,
          appCertificate,
          channelName,
          userId,
          rtcRole,
          expireTimeInSeconds,
          privilegeExpiredTs,
        );
        this.logger.log(`Generated Agora RTC token for user ${userId} in channel ${channelName}`);
      } catch (err: any) {
        this.logger.error(`Error generating Agora token: ${err.message}`, err.stack);
        token = null;
      }
    } else if (appId && !appCertificate) {
      // Testing mode with App ID only (No App Certificate required in Agora project settings)
      this.logger.log(
        `Agora running in App ID only mode for channel ${channelName}. Token set to null.`,
      );
      token = null;
    }

    return {
      appId,
      token,
      channelName,
      uid: userId,
      expireTime: privilegeExpiredTs,
    };
  }

  /**
   * Get public Agora Configuration (e.g. App ID) for clients
   */
  getConfig() {
    return {
      appId: this.agoraAppId,
      hasCertificate: Boolean(this.agoraAppCertificate),
    };
  }
}

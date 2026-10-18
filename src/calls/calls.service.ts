import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import agoraPkg from 'agora-token';
import { PrismaService } from '../prisma/prisma.service.js';

const { RtcTokenBuilder, RtcRole } = agoraPkg as any;

export interface AgoraTokenResponse {
  appId: string;
  token: string | null;
  channelName: string;
  uid: string;
  expireTime: number;
}

export class CreateCallHistoryDto {
  callId!: string;
  callType!: 'voice' | 'video';
  status!: 'ended' | 'missed' | 'declined' | 'outgoing';
  isDirect!: boolean;
  recipientId?: string;
  channelName?: string;
  durationSeconds?: number;
}

export interface CallHistoryRecord {
  id: string;
  callId: string;
  callType: string;
  status: string;
  isDirect: boolean;
  callerId: string;
  recipientId: string | null;
  channelName: string | null;
  durationSeconds: number | null;
  createdAt: Date;
  caller: { id: string; name: string | null; email: string; avatarUrl: string | null };
  recipient: { id: string; name: string | null; email: string; avatarUrl: string | null } | null;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Persist a call history record (upsert by callId to be idempotent)
   */
  async createCallHistory(
    callerId: string,
    dto: CreateCallHistoryDto,
  ): Promise<CallHistoryRecord> {
    // Upsert — same callId could be submitted twice (e.g., both parties end simultaneously)
    const existing = await this.prisma.callHistory.findFirst({
      where: { callId: dto.callId },
    });

    if (existing) {
      // Update with latest status/duration in case of re-submission
      const updated = await this.prisma.callHistory.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          durationSeconds: dto.durationSeconds ?? existing.durationSeconds,
        },
        include: {
          caller: { select: { id: true, name: true, email: true, avatarUrl: true } },
          recipient: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      });
      return updated as CallHistoryRecord;
    }

    const record = await this.prisma.callHistory.create({
      data: {
        callId: dto.callId,
        callType: dto.callType,
        status: dto.status,
        isDirect: dto.isDirect,
        callerId,
        recipientId: dto.recipientId ?? null,
        channelName: dto.channelName ?? null,
        durationSeconds: dto.durationSeconds ?? null,
      },
      include: {
        caller: { select: { id: true, name: true, email: true, avatarUrl: true } },
        recipient: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    this.logger.log(
      `Call history saved: callId=${dto.callId} status=${dto.status} caller=${callerId}`,
    );

    return record as CallHistoryRecord;
  }

  /**
   * Get call history for a direct-message conversation between two users
   */
  async getDirectCallHistory(
    userId: string,
    otherUserId: string,
    limit = 50,
  ): Promise<CallHistoryRecord[]> {
    const records = await this.prisma.callHistory.findMany({
      where: {
        isDirect: true,
        OR: [
          { callerId: userId, recipientId: otherUserId },
          { callerId: otherUserId, recipientId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        caller: { select: { id: true, name: true, email: true, avatarUrl: true } },
        recipient: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    return records as CallHistoryRecord[];
  }

  /**
   * Get call history for a channel (group calls)
   */
  async getChannelCallHistory(
    channelName: string,
    limit = 50,
  ): Promise<CallHistoryRecord[]> {
    const records = await this.prisma.callHistory.findMany({
      where: {
        isDirect: false,
        channelName,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        caller: { select: { id: true, name: true, email: true, avatarUrl: true } },
        recipient: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    return records as CallHistoryRecord[];
  }
}


import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import * as ws from 'ws';
import type { IncomingMessage } from 'node:http';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';

interface AuthenticatedSocket extends ws.WebSocket {
  userId?: string;
  userEmail?: string;
  userName?: string;
  channelRooms?: Set<string>;
  isAlive?: boolean;
}

@Injectable()
@WebSocketGateway({
  path: '/ws',
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: ws.Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Map of userId -> Set of active WebSockets for that user (allows multiple tabs/devices)
  private readonly userSockets = new Map<string, Set<AuthenticatedSocket>>();

  // Map of channelId -> Set of active WebSockets subscribed to that channel
  private readonly channelRooms = new Map<string, Set<AuthenticatedSocket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: ws.Server) {
    this.logger.log('🚀 WebSocket Gateway initialized on path: /ws');
  }

  /**
   * Handle incoming WebSocket connection and authenticate via JWT
   */
  async handleConnection(client: AuthenticatedSocket, request: IncomingMessage) {
    try {
      const host = request.headers.host || 'localhost';
      const parsedUrl = new URL(request.url || '', `http://${host}`);
      const token =
        parsedUrl.searchParams.get('token') ||
        (request.headers['sec-websocket-protocol'] as string) ||
        (request.headers['authorization'] as string)?.replace(/^Bearer\s+/i, '');

      if (!token) {
        this.logger.warn('WebSocket connection rejected: No authentication token provided');
        this.safeSend(client, {
          event: 'error',
          data: { message: 'Authentication required. Provide ?token=<jwt>' },
        });
        client.close(4001, 'Unauthorized');
        return;
      }

      // Verify JWT
      const secret =
        process.env.JWT_SECRET ||
        'chat-api-jwt-super-secret-key-change-in-production-2026';

      let payload: any;
      try {
        payload = await this.jwtService.verifyAsync(token, { secret });
      } catch (jwtErr: any) {
        this.logger.warn(`WebSocket JWT verification failed: ${jwtErr.message}`);
        this.safeSend(client, {
          event: 'error',
          data: { message: 'Invalid or expired authentication token' },
        });
        client.close(4001, 'Invalid token');
        return;
      }

      const userId = payload.sub;
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, status: true },
      });

      if (!user) {
        this.logger.warn(`WebSocket rejected: User ${userId} not found`);
        client.close(4001, 'User not found');
        return;
      }

      // Setup authenticated socket metadata
      client.userId = userId;
      client.userEmail = user.email;
      client.userName = user.name || user.email.split('@')[0];
      client.channelRooms = new Set<string>();
      client.isAlive = true;

      // Add to userSockets map
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client);

      // Auto-join all public channels and user's joined channels
      const userChannels = await this.prisma.channelMember.findMany({
        where: { userId },
        select: { channelId: true },
      });

      for (const cm of userChannels) {
        this.joinChannelInternal(client, cm.channelId);
      }

      // Update user status to online in database
      await this.prisma.user
        .update({
          where: { id: userId },
          data: { status: 'online' },
        })
        .catch(() => {});

      // Notify other clients about user coming online
      this.broadcastAll('user_status', {
        userId,
        status: 'online',
      });

      // Acknowledge connection to the client
      this.safeSend(client, {
        event: 'connected',
        data: {
          status: 'authenticated',
          userId,
          name: client.userName,
          channels: Array.from(client.channelRooms),
        },
      });

      this.logger.log(`Client connected: ${client.userName} (${userId})`);
    } catch (err: any) {
      this.logger.error(`Error during WebSocket connection handling: ${err.message}`);
      client.close(1011, 'Internal error');
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (userId) {
      // Remove from user sockets
      const userSet = this.userSockets.get(userId);
      if (userSet) {
        userSet.delete(client);
        if (userSet.size === 0) {
          this.userSockets.delete(userId);

          // User is fully offline (no other tabs open)
          await this.prisma.user
            .update({
              where: { id: userId },
              data: { status: 'offline' },
            })
            .catch(() => {});

          this.broadcastAll('user_status', {
            userId,
            status: 'offline',
          });
        }
      }

      // Remove from all channel rooms
      if (client.channelRooms) {
        for (const channelId of client.channelRooms) {
          const room = this.channelRooms.get(channelId);
          if (room) {
            room.delete(client);
            if (room.size === 0) {
              this.channelRooms.delete(channelId);
            }
          }
        }
      }

      this.logger.log(`Client disconnected: ${client.userName || userId}`);
    }
  }

  /**
   * Client joins a channel room
   */
  @SubscribeMessage('join_channel')
  handleJoinChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ) {
    if (!data?.channelId) return;
    this.joinChannelInternal(client, data.channelId);

    return {
      event: 'joined_channel',
      data: { channelId: data.channelId },
    };
  }

  /**
   * Client leaves a channel room
   */
  @SubscribeMessage('leave_channel')
  handleLeaveChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId: string },
  ) {
    if (!data?.channelId) return;
    if (client.channelRooms) {
      client.channelRooms.delete(data.channelId);
    }
    const room = this.channelRooms.get(data.channelId);
    if (room) {
      room.delete(client);
    }

    return {
      event: 'left_channel',
      data: { channelId: data.channelId },
    };
  }

  /**
   * Typing event from client
   */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId?: string; recipientId?: string },
  ) {
    if (!client.userId) return;

    const typingData = {
      userId: client.userId,
      userName: client.userName,
      channelId: data.channelId,
      recipientId: data.recipientId,
    };

    if (data.channelId) {
      this.broadcastToChannel(data.channelId, 'typing', typingData, client);
    } else if (data.recipientId) {
      this.broadcastToUser(data.recipientId, 'typing', typingData);
    }
  }

  /**
   * Stop typing event from client
   */
  @SubscribeMessage('stop_typing')
  handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { channelId?: string; recipientId?: string },
  ) {
    if (!client.userId) return;

    const stopData = {
      userId: client.userId,
      channelId: data.channelId,
      recipientId: data.recipientId,
    };

    if (data.channelId) {
      this.broadcastToChannel(data.channelId, 'stop_typing', stopData, client);
    } else if (data.recipientId) {
      this.broadcastToUser(data.recipientId, 'stop_typing', stopData);
    }
  }

  /**
   * Ping/Pong heartbeat
   */
  @SubscribeMessage('ping')
  handlePing() {
    return { event: 'pong', data: { time: Date.now() } };
  }

  // --- Public Broadcast Methods used by Services ---

  /**
   * Broadcast an event to all connected sockets in a channel room
   */
  broadcastToChannel(
    channelId: string,
    event: string,
    data: any,
    excludeClient?: AuthenticatedSocket,
  ) {
    const room = this.channelRooms.get(channelId);
    if (!room || room.size === 0) return;

    const payload = JSON.stringify({ event, data });
    for (const socket of room) {
      if (socket !== excludeClient && socket.readyState === ws.WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  /**
   * Broadcast an event to all active sockets of a specific user
   */
  broadcastToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;

    const payload = JSON.stringify({ event, data });
    for (const socket of sockets) {
      if (socket.readyState === ws.WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  /**
   * Broadcast an event to multiple users
   */
  broadcastToUsers(userIds: string[], event: string, data: any) {
    for (const id of userIds) {
      this.broadcastToUser(id, event, data);
    }
  }

  /**
   * Broadcast an event to all connected clients on the server
   */
  broadcastAll(event: string, data: any) {
    if (!this.server?.clients) return;
    const payload = JSON.stringify({ event, data });
    for (const client of this.server.clients) {
      if (client.readyState === ws.WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private joinChannelInternal(client: AuthenticatedSocket, channelId: string) {
    if (!client.channelRooms) {
      client.channelRooms = new Set();
    }
    client.channelRooms.add(channelId);

    if (!this.channelRooms.has(channelId)) {
      this.channelRooms.set(channelId, new Set());
    }
    this.channelRooms.get(channelId)!.add(client);
  }

  private safeSend(client: ws.WebSocket, msg: { event: string; data: any }) {
    if (client.readyState === ws.WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}

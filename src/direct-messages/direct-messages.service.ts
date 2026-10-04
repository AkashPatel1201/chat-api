import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatGateway } from '../websockets/websockets.gateway.js';
import { SendDirectMessageDto } from './dto/send-direct-message.dto.js';

@Injectable()
export class DirectMessagesService {
  private readonly logger = new Logger(DirectMessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Helper to ensure AI Assistant user exists
   */
  private async ensureAiUser() {
    return this.prisma.user.upsert({
      where: { email: 'bot.assistant@chatflow.internal' },
      update: {},
      create: {
        id: 'bot-assistant',
        email: 'bot.assistant@chatflow.internal',
        name: 'ChatFlow AI Assistant',
        avatarUrl: null,
        role: 'USER',
        status: 'online',
        statusMessage: 'AI Copilot ready to assist you',
        emailVerified: true,
      },
    });
  }

  /**
   * List recent direct message conversations for current user
   */
  async getConversations(userId: string) {
    const aiUser = await this.ensureAiUser();

    // Find all direct messages involving current user
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: { not: null } },
          { recipientId: userId },
        ],
      },
      select: {
        senderId: true,
        recipientId: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Collect distinct counterpart user IDs
    const userLastMessageMap = new Map<string, { content: string; createdAt: Date }>();

    for (const msg of messages) {
      const counterpartId = msg.senderId === userId ? msg.recipientId! : msg.senderId;
      if (!userLastMessageMap.has(counterpartId)) {
        userLastMessageMap.set(counterpartId, {
          content: msg.content,
          createdAt: msg.createdAt,
        });
      }
    }

    // Always include AI bot assistant if not in map
    if (!userLastMessageMap.has(aiUser.id) && aiUser.id !== userId) {
      userLastMessageMap.set(aiUser.id, {
        content: 'Hello! I can summarize discussions, write code, or answer questions.',
        createdAt: new Date(),
      });
    }

    const counterpartIds = Array.from(userLastMessageMap.keys());

    // Fetch user info for all counterpart users
    const counterpartUsers = await this.prisma.user.findMany({
      where: {
        id: { in: counterpartIds },
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        status: true,
        statusMessage: true,
      },
    });

    const userMap = new Map(counterpartUsers.map((u) => [u.id, u]));

    const conversations = counterpartIds
      .map((otherId) => {
        const user = userMap.get(otherId);
        if (!user) return null;

        const lastMsg = userLastMessageMap.get(otherId);
        return {
          id: user.id,
          user: {
            id: user.id,
            email: user.email,
            name: user.name || user.email.split('@')[0],
            avatarUrl: user.avatarUrl,
            role: user.id === aiUser.id ? 'BOT' : user.role,
            status: user.status || 'offline',
            statusMessage: user.statusMessage,
          },
          lastMessage: lastMsg?.content || '',
          lastMessageTime: lastMsg?.createdAt ? lastMsg.createdAt.toISOString() : undefined,
          unreadCount: 0,
        };
      })
      .filter(Boolean);

    return conversations;
  }

  /**
   * Get direct message history between current user and target user
   */
  async getMessages(userId: string, targetUserId: string, limit = 100) {
    const aiUser = await this.ensureAiUser();

    // Check target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    let messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: targetUserId },
          { senderId: targetUserId, recipientId: userId },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            status: true,
          },
        },
        reactions: true,
        attachments: true,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    // If talking to AI Assistant and no history exists, seed initial greeting
    if (messages.length === 0 && targetUserId === aiUser.id) {
      const welcome = await this.prisma.message.create({
        data: {
          senderId: aiUser.id,
          recipientId: userId,
          content:
            '👋 Welcome! I am your AI assistant built into ChatFlow. Feel free to ask me anything or test direct messaging in real time.',
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              role: true,
              status: true,
            },
          },
          reactions: true,
          attachments: true,
        },
      });
      messages = [welcome];
    }

    return messages.map((m) => this.formatMessage(m));
  }

  /**
   * Send a direct message to a user
   */
  async sendMessage(userId: string, recipientId: string, dto: SendDirectMessageDto) {
    if (userId === recipientId) {
      throw new BadRequestException('Cannot send direct message to yourself');
    }

    const aiUser = await this.ensureAiUser();

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient user not found');
    }

    // Save user's message
    const message = await this.prisma.message.create({
      data: {
        senderId: userId,
        recipientId,
        content: dto.content,
        attachments: dto.attachments && dto.attachments.length > 0
          ? {
              create: dto.attachments.map((att) => ({
                name: att.name,
                url: att.url,
                size: att.size || null,
                type: att.type || 'file',
              })),
            }
          : undefined,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            status: true,
          },
        },
        reactions: true,
        attachments: true,
      },
    });

    // If message was sent to AI Assistant, generate automated AI response
    if (recipientId === aiUser.id) {
      setTimeout(async () => {
        try {
          let botReplyText =
            `I received your message: "${dto.content}". How can I help you further?`;

          const lower = dto.content.toLowerCase();
          if (lower.includes('hello') || lower.includes('hi')) {
            botReplyText = 'Hello! Great to hear from you. Everything is running dynamically with the PostgreSQL database!';
          } else if (lower.includes('api') || lower.includes('backend')) {
            botReplyText = 'The backend API provides full support for Channels, Direct Messages, User Discovery, and Multi-SSO integration.';
          } else if (lower.includes('help')) {
            botReplyText = 'You can create public or private channels, browse other registered users, and send real-time direct messages.';
          }

          const botMsg = await this.prisma.message.create({
            data: {
              senderId: aiUser.id,
              recipientId: userId,
              content: botReplyText,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatarUrl: true,
                  role: true,
                  status: true,
                },
              },
              reactions: true,
              attachments: true,
            },
          });

          const botFormatted = this.formatMessage(botMsg);
          this.chatGateway.broadcastToUser(userId, 'direct_message', botFormatted);
        } catch (err) {
          this.logger.error('Failed to generate automated AI bot reply', err);
        }
      }, 500);
    }

    const formatted = this.formatMessage(message);
    this.chatGateway.broadcastToUser(recipientId, 'direct_message', formatted);
    this.chatGateway.broadcastToUser(userId, 'direct_message', formatted);
    return formatted;
  }

  private formatMessage(m: any) {
    const reactionMap: Record<string, { emoji: string; count: number; users: string[] }> = {};
    if (m.reactions) {
      for (const r of m.reactions) {
        if (!reactionMap[r.emoji]) {
          reactionMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        reactionMap[r.emoji].count += 1;
        reactionMap[r.emoji].users.push(r.userId);
      }
    }

    const isBot = m.senderId === 'bot-assistant';

    return {
      id: m.id,
      senderId: m.senderId,
      senderName: isBot
        ? 'ChatFlow AI Assistant'
        : m.sender?.name || m.sender?.email?.split('@')[0] || 'Unknown',
      senderAvatar: m.sender?.avatarUrl || undefined,
      senderRole: isBot ? 'BOT' : m.sender?.role || 'USER',
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      isEdited: m.isEdited,
      channelId: m.channelId,
      recipientId: m.recipientId,
      attachments: m.attachments?.map((a: any) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        size: a.size || undefined,
        type: a.type || 'file',
      })),
      reactions: Object.values(reactionMap),
    };
  }
}

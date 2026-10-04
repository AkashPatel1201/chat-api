import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatGateway } from '../websockets/websockets.gateway.js';
import { CreateChannelDto } from './dto/create-channel.dto.js';
import { SendChannelMessageDto } from './dto/send-channel-message.dto.js';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Seed default channels and AI Assistant user if table is empty
   */
  async ensureDefaultData(userId?: string) {
    // 1. Ensure AI Assistant bot user exists in PostgreSQL
    const aiUser = await this.prisma.user.upsert({
      where: { email: 'bot.assistant@chatflow.internal' },
      update: {},
      create: {
        id: 'bot-assistant',
        email: 'bot.assistant@chatflow.internal',
        name: 'ChatFlow AI Assistant',
        avatarUrl: null,
        role: 'USER', // Prisma enum USER/ADMIN
        status: 'online',
        statusMessage: 'AI Copilot ready to assist you',
        emailVerified: true,
      },
    });

    // 2. Ensure default channels exist
    const defaultChannels = [
      {
        name: 'general',
        description: 'Workspace-wide general discussion, updates, and welcoming newcomers',
        isPrivate: false,
        category: 'text',
      },
      {
        name: 'dev-talk',
        description: 'Next.js 16, NestJS, Tailwind v4, Prisma architecture and code discussions',
        isPrivate: false,
        category: 'text',
      },
      {
        name: 'announcements',
        description: 'Official releases, system maintenance, and milestone updates',
        isPrivate: false,
        category: 'announcements',
      },
      {
        name: 'random',
        description: 'Coffee breaks, tech memes, and watercooler banter ☕',
        isPrivate: false,
        category: 'text',
      },
    ];

    for (const chan of defaultChannels) {
      const existing = await this.prisma.channel.findUnique({
        where: { name: chan.name },
      });

      if (!existing) {
        const created = await this.prisma.channel.create({
          data: {
            name: chan.name,
            description: chan.description,
            isPrivate: chan.isPrivate,
            category: chan.category,
            createdById: userId || aiUser.id,
          },
        });

        // Add creator and AI user to channel
        if (userId) {
          await this.prisma.channelMember.create({
            data: {
              channelId: created.id,
              userId: userId,
              role: 'OWNER',
            },
          }).catch(() => {});
        }

        await this.prisma.channelMember.create({
          data: {
            channelId: created.id,
            userId: aiUser.id,
            role: 'MEMBER',
          },
        }).catch(() => {});

        // Add a welcoming message
        if (chan.name === 'general') {
          await this.prisma.message.create({
            data: {
              content: 'Welcome to **ChatFlow**! 👋 Collaborate in channels, send direct messages, and build together in real time.',
              senderId: aiUser.id,
              channelId: created.id,
            },
          }).catch(() => {});
        }
      } else if (userId) {
        // Auto-join user to public channel if not already member
        await this.prisma.channelMember.upsert({
          where: {
            channelId_userId: {
              channelId: existing.id,
              userId: userId,
            },
          },
          update: {},
          create: {
            channelId: existing.id,
            userId: userId,
            role: 'MEMBER',
          },
        }).catch(() => {});
      }
    }
  }

  /**
   * Find a channel by id or name
   */
  private async findChannelByIdOrName(idOrName: string) {
    return this.prisma.channel.findFirst({
      where: {
        OR: [{ id: idOrName }, { name: idOrName.toLowerCase() }],
      },
    });
  }

  /**
   * Get all accessible channels for the user
   */
  async getChannels(userId: string) {
    await this.ensureDefaultData(userId);

    const channels = await this.prisma.channel.findMany({
      where: {
        OR: [
          { isPrivate: false },
          {
            members: {
              some: { userId },
            },
          },
        ],
      },
      include: {
        _count: {
          select: { members: true, messages: true },
        },
        members: {
          where: { userId },
          select: { lastReadAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return channels.map((c) => {
      const userMember = c.members[0];
      return {
        id: c.id,
        name: c.name,
        description: c.description || '',
        isPrivate: c.isPrivate,
        category: c.category,
        memberCount: c._count.members,
        unreadCount: 0,
        createdAt: c.createdAt,
      };
    });
  }

  /**
   * Create a new channel
   */
  async createChannel(userId: string, dto: CreateChannelDto) {
    const cleanName = dto.name.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (!cleanName) {
      throw new BadRequestException('Invalid channel name');
    }

    const existing = await this.prisma.channel.findUnique({
      where: { name: cleanName },
    });

    if (existing) {
      throw new BadRequestException(`Channel #${cleanName} already exists`);
    }

    const channel = await this.prisma.channel.create({
      data: {
        name: cleanName,
        description: dto.description?.trim() || null,
        isPrivate: dto.isPrivate ?? false,
        category: dto.category || 'text',
        createdById: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
    });

    return {
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
      isPrivate: channel.isPrivate,
      category: channel.category,
      memberCount: 1,
      unreadCount: 0,
      createdAt: channel.createdAt,
    };
  }

  /**
   * Get channel details with members
   */
  async getChannel(userId: string, channelIdOrName: string) {
    const channel = await this.findChannelByIdOrName(channelIdOrName);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const membership = await this.prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId: channel.id,
          userId,
        },
      },
    });

    if (channel.isPrivate && !membership) {
      throw new ForbiddenException('You do not have access to this private channel');
    }

    const members = await this.prisma.channelMember.findMany({
      where: { channelId: channel.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            status: true,
            statusMessage: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return {
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
      isPrivate: channel.isPrivate,
      category: channel.category,
      memberCount: members.length,
      members: members.map((m) => ({
        ...m.user,
        channelRole: m.role,
        joinedAt: m.joinedAt,
      })),
      isMember: Boolean(membership),
    };
  }

  /**
   * Join a channel
   */
  async joinChannel(userId: string, channelIdOrName: string) {
    const channel = await this.findChannelByIdOrName(channelIdOrName);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.isPrivate) {
      throw new ForbiddenException('Private channels require an invitation to join');
    }

    await this.prisma.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId: channel.id,
          userId,
        },
      },
      update: { lastReadAt: new Date() },
      create: {
        channelId: channel.id,
        userId,
        role: 'MEMBER',
      },
    });

    return this.getChannel(userId, channel.id);
  }

  /**
   * Get channel messages
   */
  async getMessages(userId: string, channelIdOrName: string, limit = 100) {
    const channel = await this.findChannelByIdOrName(channelIdOrName);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Auto join public channels
    if (!channel.isPrivate) {
      await this.prisma.channelMember.upsert({
        where: {
          channelId_userId: {
            channelId: channel.id,
            userId,
          },
        },
        update: { lastReadAt: new Date() },
        create: {
          channelId: channel.id,
          userId,
          role: 'MEMBER',
        },
      });
    }

    const messages = await this.prisma.message.findMany({
      where: { channelId: channel.id },
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

    return messages.map((m) => this.formatMessage(m));
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(userId: string, channelIdOrName: string, dto: SendChannelMessageDto) {
    const channel = await this.findChannelByIdOrName(channelIdOrName);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Auto join public channels
    await this.prisma.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId: channel.id,
          userId,
        },
      },
      update: { lastReadAt: new Date() },
      create: {
        channelId: channel.id,
        userId,
        role: 'MEMBER',
      },
    });

    const message = await this.prisma.message.create({
      data: {
        channelId: channel.id,
        senderId: userId,
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

    const formatted = this.formatMessage(message);
    this.chatGateway.broadcastToChannel(channel.id, 'channel_message', formatted);
    return formatted;
  }

  /**
   * Helper to format database message into client-friendly format
   */
  private formatMessage(m: any) {
    // Group reactions by emoji
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

    return {
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender?.name || m.sender?.email?.split('@')[0] || 'Unknown',
      senderAvatar: m.sender?.avatarUrl || undefined,
      senderRole: m.sender?.role || 'USER',
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

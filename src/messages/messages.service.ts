import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatGateway } from '../websockets/websockets.gateway.js';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Toggle emoji reaction for a message
   */
  async toggleReaction(userId: string, messageId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const existing = await this.prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    if (existing) {
      // Remove reaction
      await this.prisma.reaction.delete({
        where: { id: existing.id },
      });
    } else {
      // Add reaction
      await this.prisma.reaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });
    }

    // Return updated aggregated reactions for this message
    const allReactions = await this.prisma.reaction.findMany({
      where: { messageId },
    });

    const reactionMap: Record<string, { emoji: string; count: number; users: string[] }> = {};
    for (const r of allReactions) {
      if (!reactionMap[r.emoji]) {
        reactionMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      }
      reactionMap[r.emoji].count += 1;
      reactionMap[r.emoji].users.push(r.userId);
    }

    const reactions = Object.values(reactionMap);

    // Broadcast reaction update
    if (message.channelId) {
      this.chatGateway.broadcastToChannel(message.channelId, 'message_reaction_updated', {
        messageId,
        reactions,
      });
    } else if (message.recipientId) {
      this.chatGateway.broadcastToUser(message.recipientId, 'message_reaction_updated', {
        messageId,
        reactions,
      });
      this.chatGateway.broadcastToUser(message.senderId, 'message_reaction_updated', {
        messageId,
        reactions,
      });
    }

    return reactions;
  }

  /**
   * Delete message
   */
  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { sender: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const isSender = message.senderId === userId;
    const isAdmin = user?.role === 'ADMIN';

    if (!isSender && !isAdmin) {
      throw new ForbiddenException('You do not have permission to delete this message');
    }

    await this.prisma.message.delete({
      where: { id: messageId },
    });

    // Broadcast deletion
    if (message.channelId) {
      this.chatGateway.broadcastToChannel(message.channelId, 'message_deleted', {
        messageId,
        channelId: message.channelId,
      });
    } else if (message.recipientId) {
      this.chatGateway.broadcastToUser(message.recipientId, 'message_deleted', {
        messageId,
      });
      this.chatGateway.broadcastToUser(message.senderId, 'message_deleted', {
        messageId,
      });
    }

    return { success: true, messageId };
  }
}

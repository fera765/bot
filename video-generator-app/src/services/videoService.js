const { createCanvas, loadImage, registerFont } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const sharp = require('sharp');

ffmpeg.setFfmpegPath(ffmpegPath);

class VideoService {
  constructor() {
    this.frameRate = 30;
    this.width = 1920;
    this.height = 1080;
    this.tempDir = path.join(__dirname, '../../temp');
    
    // UI Colors and Styles
    this.colors = {
      topbarBg: 'rgba(20, 20, 20, 0.95)',
      chatPanelBg: 'rgba(15, 15, 15, 0.85)',
      youBubble: '#00BCD4', // Ciano
      otherBubble: '#FFFFFF',
      systemAlert: '#FF4444',
      xpBar: '#FFD700',
      xpBarBg: 'rgba(255, 255, 255, 0.1)',
      captionBg: 'rgba(0, 0, 0, 0.7)',
      chapterActive: '#FFD700',
      chapterInactive: 'rgba(255, 255, 255, 0.3)'
    };
    
    // Animation timings
    this.timings = {
      messageDelay: 2000, // 2s between messages
      bubbleAnimation: 150, // 150ms pop animation
      focusEffect: 600, // 600ms focus change
      pulseEffect: 600, // 600ms pulse
      holdCliffhanger: 2000 // 2s hold on cliffhanger
    };
  }

  async generateVideo(videoData, jobId) {
    try {
      const {
        title = 'Mensagem no Ultrassom',
        episode = 1,
        totalEpisodes = 7,
        dialogues = [],
        background = 'minecraft'
      } = videoData;

      // Create temp directory for frames
      const jobTempDir = path.join(this.tempDir, jobId);
      await fs.mkdir(jobTempDir, { recursive: true });

      console.log(`Starting video generation for job ${jobId}`);

      // Generate frames with new UI
      const frames = await this.generateFrames({
        title,
        episode,
        totalEpisodes,
        dialogues,
        background
      }, jobTempDir);
      
      // Create video from frames
      const outputFilename = `video_${Date.now()}_${jobId}.mp4`;
      const outputPath = path.join(__dirname, '../../public/videos', outputFilename);
      
      await this.createVideoFromFrames(jobTempDir, outputPath, frames.length);

      // Clean up temp files
      await this.cleanupTempFiles(jobTempDir);

      console.log(`Video generation completed: ${outputFilename}`);

      return {
        filename: outputFilename,
        url: `/videos/${outputFilename}`
      };

    } catch (error) {
      console.error('Error in generateVideo:', error);
      throw error;
    }
  }

  async generateFrames(videoData, tempDir) {
    const frames = [];
    let frameIndex = 0;
    
    const { title, episode, totalEpisodes, dialogues, background } = videoData;
    
    // Calculate total duration and frames
    const totalMessages = dialogues.length;
    const framesPerMessage = Math.floor(this.frameRate * 2); // 2 seconds per message
    const totalFrames = totalMessages * framesPerMessage + this.frameRate * 2; // +2s for ending
    
    // State tracking
    let currentMessageIndex = 0;
    let messageProgress = 0;
    let xpProgress = 0;
    let visibleMessages = [];
    let currentChapter = 1;
    const totalChapters = 7;
    
    // Generate each frame
    for (let f = 0; f < totalFrames; f++) {
      // Calculate current state
      const globalProgress = f / totalFrames;
      const messageFrame = f % framesPerMessage;
      messageProgress = messageFrame / framesPerMessage;
      
      // Add new message when needed
      if (f > 0 && f % framesPerMessage === 0 && currentMessageIndex < dialogues.length) {
        visibleMessages.push({
          ...dialogues[currentMessageIndex],
          animationProgress: 0,
          index: currentMessageIndex
        });
        currentMessageIndex++;
        
        // Update chapter progress
        currentChapter = Math.min(totalChapters, Math.floor((currentMessageIndex / totalMessages) * totalChapters) + 1);
      }
      
      // Update animation progress for visible messages
      visibleMessages = visibleMessages.map(msg => ({
        ...msg,
        animationProgress: Math.min(1, msg.animationProgress + 0.1)
      }));
      
      // Update XP progress
      xpProgress = currentMessageIndex / totalMessages;
      
      // Check if we're at a key moment
      const isHookMoment = f < this.frameRate * 2; // First 2 seconds
      const isRevelation = dialogues[currentMessageIndex - 1]?.type === 'revelation';
      const isCliffhanger = currentMessageIndex >= dialogues.length - 1 && f >= totalFrames - this.frameRate * 2;
      
      // Create frame
      const frame = await this.createFrame({
        title,
        episode,
        totalEpisodes,
        visibleMessages,
        currentChapter,
        totalChapters,
        xpProgress,
        globalProgress,
        messageProgress,
        background,
        isHookMoment,
        isRevelation,
        isCliffhanger,
        frameNumber: f
      });

      const framePath = path.join(tempDir, `frame_${String(frameIndex).padStart(6, '0')}.png`);
      await fs.writeFile(framePath, frame);
      frames.push(framePath);
      frameIndex++;
    }

    return frames;
  }

  async createFrame(state) {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    // 1. Draw dynamic background
    await this.drawDynamicBackground(ctx, state);
    
    // 2. Apply focus effects if needed
    if (state.isRevelation || state.isCliffhanger) {
      this.applyFocusEffect(ctx, state);
    }
    
    // 3. Draw topbar
    this.drawTopbar(ctx, state);
    
    // 4. Draw chat panel
    await this.drawChatPanel(ctx, state);
    
    // 5. Draw footer with XP bar
    this.drawFooter(ctx, state);
    
    // 6. Draw caption if needed
    if (state.visibleMessages.length > 0) {
      this.drawCaption(ctx, state);
    }
    
    // 7. Apply microinteractions
    this.applyMicrointeractions(ctx, state);

    return canvas.toBuffer('image/png');
  }

  async drawDynamicBackground(ctx, state) {
    const { background, frameNumber, isRevelation } = state;
    
    // Create animated gradient background
    const gradients = {
      minecraft: ['#4CAF50', '#8BC34A', '#CDDC39'],
      space: ['#000428', '#004e92', '#009FFD'],
      cityscape: ['#0F2027', '#203A43', '#2C5364'],
      default: ['#667eea', '#764ba2', '#f093fb']
    };

    const colors = gradients[background] || gradients.default;
    
    // Animated gradient with movement
    const offset = (frameNumber * 2) % 360;
    const gradient = ctx.createLinearGradient(
      Math.cos(offset * Math.PI / 180) * this.width,
      Math.sin(offset * Math.PI / 180) * this.height,
      this.width - Math.cos(offset * Math.PI / 180) * this.width,
      this.height - Math.sin(offset * Math.PI / 180) * this.height
    );
    
    colors.forEach((color, index) => {
      gradient.addColorStop(index / (colors.length - 1), color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // Add gameplay elements with high saturation
    this.drawGameplayElements(ctx, state);
    
    // Apply blur and desaturation during revelations
    if (isRevelation) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }
  }

  drawGameplayElements(ctx, state) {
    const { frameNumber, background } = state;
    
    if (background === 'minecraft') {
      // Draw moving blocks
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 20; i++) {
        const x = ((i * 100 + frameNumber * 3) % (this.width + 100)) - 50;
        const y = 200 + Math.sin((frameNumber + i * 30) / 30) * 100;
        const size = 40 + Math.sin(i) * 20;
        
        ctx.fillStyle = i % 2 === 0 ? '#8B4513' : '#228B22';
        ctx.fillRect(x, y, size, size);
        
        // Add highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x, y, size, 4);
        ctx.fillRect(x, y, 4, size);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawTopbar(ctx, state) {
    const { title, episode, totalEpisodes, currentChapter, totalChapters, globalProgress } = state;
    const topbarHeight = 80;
    
    // Draw topbar background
    ctx.fillStyle = this.colors.topbarBg;
    ctx.fillRect(0, 0, this.width, topbarHeight);
    
    // Left: Logo and title
    const logoSize = 50;
    const logoX = 30;
    const logoY = (topbarHeight - logoSize) / 2;
    
    // Draw logo gradient square
    const logoGradient = ctx.createLinearGradient(logoX, logoY, logoX + logoSize, logoY + logoSize);
    logoGradient.addColorStop(0, '#FFD700');
    logoGradient.addColorStop(1, '#FFA000');
    ctx.fillStyle = logoGradient;
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    
    // Draw title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(title, logoX + logoSize + 20, topbarHeight / 2 + 8);
    
    // Center: Chapter progress dots
    const dotsStartX = this.width / 2 - (totalChapters * 30) / 2;
    for (let i = 0; i < totalChapters; i++) {
      const dotX = dotsStartX + i * 30;
      const dotY = topbarHeight / 2;
      const isActive = i < currentChapter;
      const isGlowing = globalProgress > 0.85 && isActive;
      
      // Draw dot
      ctx.beginPath();
      ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
      
      if (isGlowing) {
        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.colors.chapterActive;
      }
      
      ctx.fillStyle = isActive ? this.colors.chapterActive : this.colors.chapterInactive;
      ctx.fill();
      
      ctx.shadowBlur = 0;
      
      // Connect dots with line
      if (i < totalChapters - 1) {
        ctx.strokeStyle = this.colors.chapterInactive;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dotX + 8, dotY);
        ctx.lineTo(dotX + 22, dotY);
        ctx.stroke();
      }
    }
    
    // Right: Episode counter
    const episodeText = `Ep. ${episode}/${totalEpisodes}`;
    const episodeWidth = 120;
    const episodeX = this.width - episodeWidth - 30;
    const episodeY = (topbarHeight - 40) / 2;
    
    // Pulse effect near climax
    if (globalProgress > 0.85) {
      const pulse = Math.sin(state.frameNumber / 10) * 0.05 + 1;
      ctx.save();
      ctx.translate(episodeX + episodeWidth / 2, episodeY + 20);
      ctx.scale(pulse, pulse);
      ctx.translate(-(episodeX + episodeWidth / 2), -(episodeY + 20));
    }
    
    // Draw episode capsule
    ctx.fillStyle = '#FFD700';
    this.roundRect(ctx, episodeX, episodeY, episodeWidth, 40, 20);
    ctx.fill();
    
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(episodeText, episodeX + episodeWidth / 2, episodeY + 25);
    ctx.textAlign = 'left';
    
    if (globalProgress > 0.85) {
      ctx.restore();
    }
  }

  async drawChatPanel(ctx, state) {
    const { visibleMessages, isCliffhanger } = state;
    
    // Chat panel dimensions
    const panelWidth = 600;
    const panelHeight = 700;
    const panelX = (this.width - panelWidth) / 2;
    const panelY = 120;
    
    // Draw glass panel background
    ctx.fillStyle = this.colors.chatPanelBg;
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 20);
    ctx.fill();
    
    // Add glass border effect
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 20);
    ctx.stroke();
    
    // Draw messages
    let currentY = panelY + 30;
    const maxVisibleMessages = 8;
    const startIndex = Math.max(0, visibleMessages.length - maxVisibleMessages);
    
    for (let i = startIndex; i < visibleMessages.length; i++) {
      const message = visibleMessages[i];
      const isYou = message.speaker === 'You' || message.speaker === 'Você';
      const isSystem = message.type === 'system' || message.type === 'alert';
      
      // Calculate bubble position with animation
      const animOffset = (1 - message.animationProgress) * 20;
      const bubbleY = currentY + animOffset;
      const opacity = message.animationProgress;
      
      ctx.globalAlpha = opacity;
      
      // Draw message bubble
      const maxBubbleWidth = panelWidth - 80;
      const padding = 15;
      
      // Measure text
      ctx.font = '16px Arial';
      const lines = this.wrapText(ctx, message.message, maxBubbleWidth - padding * 2);
      const bubbleHeight = lines.length * 24 + padding * 2;
      const bubbleWidth = Math.min(
        maxBubbleWidth,
        Math.max(...lines.map(line => ctx.measureText(line).width)) + padding * 2
      );
      
      // Position based on sender
      const bubbleX = isYou ? 
        panelX + panelWidth - bubbleWidth - 40 : 
        panelX + 40;
      
      // Choose bubble color
      let bubbleColor = isYou ? this.colors.youBubble : this.colors.otherBubble;
      if (isSystem) bubbleColor = this.colors.systemAlert;
      if (isCliffhanger && i === visibleMessages.length - 1) bubbleColor = this.colors.systemAlert;
      
      // Draw bubble with pop animation
      const scale = 0.95 + message.animationProgress * 0.05;
      ctx.save();
      ctx.translate(bubbleX + bubbleWidth / 2, bubbleY + bubbleHeight / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(bubbleX + bubbleWidth / 2), -(bubbleY + bubbleHeight / 2));
      
      ctx.fillStyle = bubbleColor;
      this.roundRect(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, 15);
      ctx.fill();
      
      // Draw text
      ctx.fillStyle = isYou || isSystem ? '#FFFFFF' : '#000000';
      ctx.font = '16px Arial';
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, bubbleX + padding, bubbleY + padding + 20 + lineIndex * 24);
      });
      
      // Draw timestamp if it's an image
      if (message.image) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '12px Arial';
        ctx.fillText('10:23', bubbleX + bubbleWidth - 45, bubbleY + bubbleHeight - 10);
      }
      
      ctx.restore();
      ctx.globalAlpha = 1;
      
      currentY = bubbleY + bubbleHeight + 20;
    }
    
    // Draw "Continua..." message if it's a cliffhanger
    if (isCliffhanger && state.globalProgress > 0.95) {
      ctx.fillStyle = this.colors.systemAlert;
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Continua no Ep. 2...', this.width / 2, panelY + panelHeight - 40);
      ctx.textAlign = 'left';
    }
  }

  drawFooter(ctx, state) {
    const { xpProgress, globalProgress } = state;
    const footerHeight = 100;
    const footerY = this.height - footerHeight;
    
    // Draw footer background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, footerY, this.width, footerHeight);
    
    // Draw XP bar
    const barWidth = this.width - 400;
    const barHeight = 30;
    const barX = 50;
    const barY = footerY + (footerHeight - barHeight) / 2;
    
    // XP bar background
    ctx.fillStyle = this.colors.xpBarBg;
    this.roundRect(ctx, barX, barY, barWidth, barHeight, 15);
    ctx.fill();
    
    // XP bar progress
    const progressWidth = barWidth * xpProgress;
    const xpGradient = ctx.createLinearGradient(barX, barY, barX + progressWidth, barY);
    xpGradient.addColorStop(0, '#FFD700');
    xpGradient.addColorStop(1, '#FFA000');
    ctx.fillStyle = xpGradient;
    this.roundRect(ctx, barX, barY, progressWidth, barHeight, 15);
    ctx.fill();
    
    // Flash effect at 100%
    if (xpProgress >= 0.99) {
      const flash = Math.sin(state.frameNumber / 3) * 0.3 + 0.7;
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#FFFFFF';
      this.roundRect(ctx, barX, barY, progressWidth, barHeight, 15);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    // Draw progress label
    if (xpProgress > 0.85 && xpProgress < 0.95) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '14px Arial';
      ctx.fillText('Chegando no clímax...', barX + progressWidth + 10, barY - 5);
    }
    
    // Draw time badge
    const badgeX = this.width - 300;
    const badgeY = barY;
    const badgeWidth = 150;
    
    ctx.fillStyle = '#FFD700';
    this.roundRect(ctx, badgeX, badgeY, badgeWidth, barHeight, 15);
    ctx.fill();
    
    // Clock icon and text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🕐 19H Diário', badgeX + badgeWidth / 2, badgeY + 20);
    ctx.textAlign = 'left';
  }

  drawCaption(ctx, state) {
    const { visibleMessages } = state;
    if (visibleMessages.length === 0) return;
    
    const lastMessage = visibleMessages[visibleMessages.length - 1];
    if (!lastMessage.caption) return;
    
    // Caption appears for 2 seconds after message
    if (lastMessage.animationProgress < 0.8) {
      const captionY = 850;
      const captionHeight = 40;
      
      // Draw caption background
      ctx.fillStyle = this.colors.captionBg;
      ctx.fillRect(0, captionY, this.width, captionHeight);
      
      // Draw caption text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'italic 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(lastMessage.caption || 'Detalhes importam.', this.width / 2, captionY + 25);
      ctx.textAlign = 'left';
    }
  }

  applyFocusEffect(ctx, state) {
    const { isRevelation, messageProgress } = state;
    
    if (isRevelation && messageProgress < 0.3) {
      // Darken background during revelation
      const darkness = 0.1 * (1 - messageProgress / 0.3);
      ctx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  applyMicrointeractions(ctx, state) {
    const { isHookMoment, frameNumber } = state;
    
    // Micro zoom on hook moment
    if (isHookMoment) {
      const zoom = 1 + Math.sin(frameNumber / 20) * 0.02;
      ctx.save();
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-this.width / 2, -this.height / 2);
      // Content would be redrawn here in a real implementation
      ctx.restore();
    }
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  roundRect(ctx, x, y, width, height, radius) {
    if (typeof radius === 'number') {
      radius = [radius, radius, radius, radius];
    }
    
    ctx.beginPath();
    ctx.moveTo(x + radius[0], y);
    ctx.lineTo(x + width - radius[1], y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius[1]);
    ctx.lineTo(x + width, y + height - radius[2]);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius[2], y + height);
    ctx.lineTo(x + radius[3], y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius[3]);
    ctx.lineTo(x, y + radius[0]);
    ctx.quadraticCurveTo(x, y, x + radius[0], y);
    ctx.closePath();
  }

  async createVideoFromFrames(framesDir, outputPath, frameCount) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(framesDir, 'frame_%06d.png'))
        .inputFPS(this.frameRate)
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-crf 18', // Higher quality
          '-preset slow', // Better compression
          '-movflags +faststart',
          '-vf scale=1920:1080'
        ])
        .fps(this.frameRate)
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent?.toFixed(2)}% done`);
        })
        .on('end', () => {
          console.log('Video creation completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async cleanupTempFiles(tempDir) {
    try {
      const files = await fs.readdir(tempDir);
      await Promise.all(files.map(file => 
        fs.unlink(path.join(tempDir, file))
      ));
      await fs.rmdir(tempDir);
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }
}

module.exports = new VideoService();
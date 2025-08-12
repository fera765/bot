const { createCanvas, loadImage } = require('canvas');
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
  }

  async generateVideo(videoData, jobId) {
    try {
      const {
        title = 'Generated Video',
        background = 'minecraft',
        dialogues = []
      } = videoData;

      // Create temp directory for frames
      const jobTempDir = path.join(this.tempDir, jobId);
      await fs.mkdir(jobTempDir, { recursive: true });

      console.log(`Starting video generation for job ${jobId}`);

      // Generate frames
      const frames = await this.generateFrames(dialogues, background, jobTempDir);
      
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

  async generateFrames(dialogues, backgroundType, tempDir) {
    const frames = [];
    let frameIndex = 0;

    // Calculate frames per dialogue (2 seconds per dialogue)
    const framesPerDialogue = this.frameRate * 2;

    for (let i = 0; i < dialogues.length; i++) {
      const dialogue = dialogues[i];
      
      // Generate frames for this dialogue
      for (let f = 0; f < framesPerDialogue; f++) {
        const progress = f / framesPerDialogue;
        const frame = await this.createFrame(
          dialogue,
          dialogues.slice(0, i + 1),
          backgroundType,
          progress,
          frameIndex
        );

        const framePath = path.join(tempDir, `frame_${String(frameIndex).padStart(6, '0')}.png`);
        await fs.writeFile(framePath, frame);
        frames.push(framePath);
        frameIndex++;
      }
    }

    // Add final frames (hold last dialogue for 1 second)
    const finalFrames = this.frameRate;
    for (let f = 0; f < finalFrames; f++) {
      const lastDialogue = dialogues[dialogues.length - 1];
      const frame = await this.createFrame(
        lastDialogue,
        dialogues,
        backgroundType,
        1,
        frameIndex
      );

      const framePath = path.join(tempDir, `frame_${String(frameIndex).padStart(6, '0')}.png`);
      await fs.writeFile(framePath, frame);
      frames.push(framePath);
      frameIndex++;
    }

    return frames;
  }

  async createFrame(currentDialogue, allDialogues, backgroundType, progress, frameNumber) {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    // Draw background
    await this.drawBackground(ctx, backgroundType, frameNumber);

    // Draw chat interface
    await this.drawChatInterface(ctx, allDialogues, progress);

    // If dialogue has an image, draw it
    if (currentDialogue.image && progress > 0.3) {
      await this.drawDialogueImage(ctx, currentDialogue.image, progress);
    }

    return canvas.toBuffer('image/png');
  }

  async drawBackground(ctx, backgroundType, frameNumber) {
    // Create animated gradient background based on type
    const gradients = {
      minecraft: ['#87CEEB', '#98D98E', '#90EE90'],
      space: ['#000428', '#004e92', '#1a1a2e'],
      cityscape: ['#141E30', '#243B55', '#2C5F7C'],
      default: ['#667eea', '#764ba2', '#f093fb']
    };

    const colors = gradients[backgroundType] || gradients.default;
    
    // Animated gradient
    const offset = (frameNumber * 2) % 360;
    const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
    
    colors.forEach((color, index) => {
      const position = (index / (colors.length - 1));
      gradient.addColorStop(position, color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // Add animated elements based on background type
    if (backgroundType === 'minecraft') {
      this.drawMinecraftElements(ctx, frameNumber);
    } else if (backgroundType === 'space') {
      this.drawSpaceElements(ctx, frameNumber);
    }
  }

  drawMinecraftElements(ctx, frameNumber) {
    // Draw simple block-like elements
    const blockSize = 60;
    const numBlocks = 15;
    
    ctx.globalAlpha = 0.3;
    
    for (let i = 0; i < numBlocks; i++) {
      const x = (i * 150 + frameNumber * 2) % (this.width + blockSize) - blockSize;
      const y = this.height - 200 + Math.sin(i + frameNumber / 30) * 50;
      
      // Draw block
      ctx.fillStyle = i % 2 === 0 ? '#8B7355' : '#228B22';
      ctx.fillRect(x, y, blockSize, blockSize);
      
      // Add highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(x, y, blockSize, 5);
      ctx.fillRect(x, y, 5, blockSize);
    }
    
    ctx.globalAlpha = 1;
  }

  drawSpaceElements(ctx, frameNumber) {
    // Draw stars
    ctx.fillStyle = 'white';
    const numStars = 100;
    
    for (let i = 0; i < numStars; i++) {
      const x = (i * 73) % this.width;
      const y = (i * 37) % this.height;
      const size = (i % 3) + 1;
      const opacity = 0.3 + (Math.sin(frameNumber / 20 + i) + 1) * 0.35;
      
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }

  async drawChatInterface(ctx, dialogues, progress) {
    // Chat container
    const chatWidth = 600;
    const chatHeight = 800;
    const chatX = (this.width - chatWidth) / 2;
    const chatY = (this.height - chatHeight) / 2;

    // Draw phone/chat container
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 2;
    
    // Rounded rectangle for chat container
    this.roundRect(ctx, chatX, chatY, chatWidth, chatHeight, 20);
    ctx.fill();
    ctx.stroke();

    // Draw header
    ctx.fillStyle = '#075e54';
    this.roundRect(ctx, chatX, chatY, chatWidth, 80, [20, 20, 0, 0]);
    ctx.fill();

    // Header text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('Chat', chatX + 20, chatY + 50);

    // Draw messages
    const messageStartY = chatY + 100;
    let currentY = messageStartY;
    const messageSpacing = 20;

    for (let i = 0; i < dialogues.length; i++) {
      const dialogue = dialogues[i];
      const isVisible = i < dialogues.length - 1 || progress > 0.1;
      
      if (!isVisible) continue;

      const isLeft = i % 2 === 0;
      const messageOpacity = i === dialogues.length - 1 ? 
        Math.min(1, progress * 2) : 1;

      ctx.globalAlpha = messageOpacity;

      // Message bubble
      const maxWidth = chatWidth - 100;
      const padding = 15;
      
      // Measure text
      ctx.font = '18px Arial';
      const lines = this.wrapText(ctx, dialogue.message, maxWidth - padding * 2);
      const messageHeight = lines.length * 25 + padding * 2;
      const messageWidth = Math.min(
        maxWidth,
        Math.max(...lines.map(line => ctx.measureText(line).width)) + padding * 2
      );

      const messageX = isLeft ? 
        chatX + 20 : 
        chatX + chatWidth - messageWidth - 20;

      // Draw speaker name
      ctx.fillStyle = '#666';
      ctx.font = '14px Arial';
      ctx.fillText(dialogue.speaker, messageX, currentY - 5);

      // Draw message bubble
      ctx.fillStyle = isLeft ? '#e3f2fd' : '#dcf8c6';
      this.roundRect(ctx, messageX, currentY, messageWidth, messageHeight, 15);
      ctx.fill();

      // Draw message text
      ctx.fillStyle = '#000';
      ctx.font = '18px Arial';
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, messageX + padding, currentY + padding + 20 + lineIndex * 25);
      });

      currentY += messageHeight + messageSpacing + 20;
    }

    ctx.globalAlpha = 1;
  }

  async drawDialogueImage(ctx, imageUrl, progress) {
    try {
      // Download and process image
      const imagePath = path.join(this.tempDir, `temp_image_${Date.now()}.jpg`);
      
      if (imageUrl.startsWith('http')) {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        await fs.writeFile(imagePath, response.data);
      }

      // Resize image if needed
      const resizedPath = path.join(this.tempDir, `resized_${Date.now()}.jpg`);
      await sharp(imagePath)
        .resize(400, 400, { fit: 'inside' })
        .toFile(resizedPath);

      const image = await loadImage(resizedPath);
      
      // Animate image appearance
      const scale = 0.5 + progress * 0.5;
      const opacity = Math.min(1, (progress - 0.3) * 3);
      
      ctx.globalAlpha = opacity;
      
      const imageX = this.width - 500;
      const imageY = 100;
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;

      // Draw image with shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;
      
      ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);
      
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;

      // Clean up temp images
      await fs.unlink(imagePath).catch(() => {});
      await fs.unlink(resizedPath).catch(() => {});

    } catch (error) {
      console.error('Error drawing dialogue image:', error);
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
          '-crf 23',
          '-preset medium',
          '-movflags +faststart'
        ])
        .size('1920x1080')
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
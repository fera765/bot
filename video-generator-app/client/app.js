// API Configuration
const API_URL = 'http://localhost:5000/api';

// State Management
let currentJobId = null;
let statusCheckInterval = null;
let selectedFile = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeForm();
    loadVideos();
});

// Tab Management
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Update button states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show/hide tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(targetTab).classList.remove('hidden');
        });
    });
}

// Form Initialization
function initializeForm() {
    const form = document.getElementById('video-form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const videoData = {
            title: document.getElementById('form-title').value || 'Generated Video',
            background: document.getElementById('form-background').value,
            dialogues: []
        };
        
        // Collect dialogues
        const dialogueItems = document.querySelectorAll('.dialogue-item');
        dialogueItems.forEach(item => {
            const speaker = item.querySelector('.speaker-input').value;
            const message = item.querySelector('.message-input').value;
            const image = item.querySelector('.image-input').value;
            
            if (speaker && message) {
                const dialogue = { speaker, message };
                if (image) dialogue.image = image;
                videoData.dialogues.push(dialogue);
            }
        });
        
        if (videoData.dialogues.length === 0) {
            showNotification('Por favor, adicione pelo menos um diálogo', 'error');
            return;
        }
        
        await generateVideo(videoData);
    });
}

// Generate Video from JSON
async function generateFromJSON() {
    const textarea = document.getElementById('json-textarea');
    const jsonText = textarea.value.trim();
    
    if (!jsonText) {
        showNotification('Por favor, cole um JSON válido', 'error');
        return;
    }
    
    try {
        const videoData = JSON.parse(jsonText);
        await generateVideo(videoData);
    } catch (error) {
        showNotification('JSON inválido: ' + error.message, 'error');
    }
}

// Generate Video from File
function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (file) {
        selectedFile = file;
        document.getElementById('file-info').innerHTML = `
            <strong>Arquivo selecionado:</strong> ${file.name} (${formatFileSize(file.size)})
        `;
        document.getElementById('file-info').classList.remove('hidden');
        document.getElementById('generate-file-btn').disabled = false;
    }
}

async function generateFromFile() {
    if (!selectedFile) {
        showNotification('Por favor, selecione um arquivo', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('jsonFile', selectedFile);
    
    try {
        showStatus('Enviando arquivo...');
        
        const response = await fetch(`${API_URL}/videos/generate-from-file`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentJobId = data.jobId;
            startStatusChecking();
        } else {
            throw new Error(data.message || 'Erro ao processar arquivo');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Erro ao gerar vídeo: ' + error.message, 'error');
        closeStatus();
    }
}

// Main Video Generation Function
async function generateVideo(videoData) {
    try {
        showStatus('Iniciando geração do vídeo...');
        
        const response = await fetch(`${API_URL}/videos/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(videoData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentJobId = data.jobId;
            startStatusChecking();
        } else {
            throw new Error(data.message || 'Erro ao gerar vídeo');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Erro ao gerar vídeo: ' + error.message, 'error');
        closeStatus();
    }
}

// Status Checking
function startStatusChecking() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    statusCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/videos/status/${currentJobId}`);
            const status = await response.json();
            
            if (status.status === 'completed') {
                clearInterval(statusCheckInterval);
                showNotification('Vídeo gerado com sucesso!', 'success');
                closeStatus();
                loadVideos();
                
                // Show video in modal
                if (status.url) {
                    setTimeout(() => {
                        playVideo(status.url, status.filename);
                    }, 500);
                }
            } else if (status.status === 'failed') {
                clearInterval(statusCheckInterval);
                showNotification('Erro na geração: ' + (status.error || 'Erro desconhecido'), 'error');
                closeStatus();
            } else {
                updateStatus(`Processando... ${status.progress || 0}%`);
                if (status.progress) {
                    updateProgress(status.progress);
                }
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    }, 2000);
}

// Load Videos
async function loadVideos() {
    try {
        const response = await fetch(`${API_URL}/videos/list`);
        const data = await response.json();
        
        const videosGrid = document.getElementById('videos-grid');
        
        if (data.videos && data.videos.length > 0) {
            videosGrid.innerHTML = data.videos.map(video => `
                <div class="video-card" onclick="playVideo('${video.url}', '${video.filename}')">
                    <div class="video-thumbnail">
                        🎬
                    </div>
                    <div class="video-info">
                        <div class="video-title">${video.filename}</div>
                        <div class="video-meta">
                            <span>${formatFileSize(video.size)}</span>
                            <span>${formatDate(video.createdAt)}</span>
                        </div>
                        <div class="video-actions">
                            <button class="btn btn-primary" onclick="event.stopPropagation(); downloadVideo('${video.downloadUrl}')">
                                ⬇️ Download
                            </button>
                            <button class="btn btn-danger" onclick="event.stopPropagation(); deleteVideo('${video.filename}')">
                                🗑️ Deletar
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            videosGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #718096;">
                    <p style="font-size: 1.2em;">Nenhum vídeo gerado ainda</p>
                    <p>Use o formulário acima para criar seu primeiro vídeo!</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading videos:', error);
        showNotification('Erro ao carregar vídeos', 'error');
    }
}

// Play Video in Modal
function playVideo(url, filename) {
    const modal = document.getElementById('video-modal');
    const video = document.getElementById('modal-video');
    
    video.src = url;
    video.load();
    
    document.getElementById('download-btn').onclick = () => downloadVideo(`/api/videos/download/${filename}`);
    document.getElementById('delete-btn').onclick = () => {
        closeModal();
        deleteVideo(filename);
    };
    
    modal.classList.remove('hidden');
}

// Close Modal
function closeModal() {
    const modal = document.getElementById('video-modal');
    const video = document.getElementById('modal-video');
    
    video.pause();
    video.src = '';
    modal.classList.add('hidden');
}

// Download Video
function downloadVideo(url) {
    window.open(url, '_blank');
}

// Delete Video
async function deleteVideo(filename) {
    if (!confirm('Tem certeza que deseja deletar este vídeo?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/videos/${filename}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Vídeo deletado com sucesso', 'success');
            loadVideos();
        } else {
            throw new Error('Erro ao deletar vídeo');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Erro ao deletar vídeo', 'error');
    }
}

// Dialogue Management
function addDialogue() {
    const container = document.getElementById('dialogues-container');
    const dialogueItem = document.createElement('div');
    dialogueItem.className = 'dialogue-item';
    dialogueItem.innerHTML = `
        <input type="text" placeholder="Nome" class="speaker-input">
        <textarea placeholder="Mensagem" class="message-input"></textarea>
        <input type="url" placeholder="URL da imagem (opcional)" class="image-input">
        <button type="button" class="btn-remove" onclick="removeDialogue(this)">❌</button>
    `;
    container.appendChild(dialogueItem);
}

function removeDialogue(button) {
    const dialogueItem = button.closest('.dialogue-item');
    const container = document.getElementById('dialogues-container');
    
    if (container.children.length > 1) {
        dialogueItem.remove();
    } else {
        showNotification('Você precisa ter pelo menos um diálogo', 'error');
    }
}

// UI Helper Functions
function showStatus(message) {
    const statusContainer = document.getElementById('generation-status');
    const statusMessage = document.getElementById('status-message');
    
    statusMessage.textContent = message;
    statusContainer.classList.remove('hidden');
}

function updateStatus(message) {
    document.getElementById('status-message').textContent = message;
}

function updateProgress(percent) {
    const progressBar = document.querySelector('.progress-bar');
    const progressFill = document.getElementById('progress-fill');
    
    progressBar.classList.remove('hidden');
    progressFill.style.width = `${percent}%`;
}

function closeStatus() {
    document.getElementById('generation-status').classList.add('hidden');
    document.querySelector('.progress-bar').classList.add('hidden');
    document.getElementById('progress-fill').style.width = '0%';
    
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#667eea'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Utility Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
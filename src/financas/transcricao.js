const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

const openai = new OpenAI({
    apiKey: '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',
});

async function transcreverAudio(buffer) {
    const tempDir = path.join(__dirname, 'temp');
    const audioPath = path.join(tempDir, `audio-${Date.now()}.ogg`);

    try {

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        await writeFile(audioPath, buffer);
        const stats = fs.statSync(audioPath);

        if (stats.size === 0) {
            throw new Error('Arquivo de áudio vazio');
        }

        const response = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "verbose_json", // Mais detalhes
            prompt: "Transcreva o áudio em português brasileiro. Quando ouvir 'e' entre dois números, interprete como vírgula decimal. Exemplo: 'noventa e sete e cinquenta' deve ser transcrito como '97,50'."
        });

        if (!response || typeof response !== 'object') {
            throw new Error('Resposta da API inválida');
        }

        const transcribedText = response.text || '';
        return transcribedText.trim() || null;

    } catch (error) {
        console.error('❌ Erro detalhado:', {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        return null;
    } finally {
        try {
            if (fs.existsSync(audioPath)) {
                await unlink(audioPath);
            }
        } catch (cleanupError) {
            console.error('Erro na limpeza:', cleanupError);
        }
    }
}

module.exports = transcreverAudio;
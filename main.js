require('./settings')
const { default: makeWaSocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidDecode } = require("@dappaoffc/baileys")

const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const figlet = require('figlet')
const { smsg } = require('./lib/simple')

const store = {}

// Readline for pairing code
const readline = require("readline");
const usePairingCode = global.pairing
const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(text, resolve)
    })
};

async function Botstarted() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const { version, isLatest } = await fetchLatestBaileysVersion()

    const arap = makeWaSocket({
        printQRInTerminal: !usePairingCode,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: state,
        logger: pino({ level: "silent" }),
    });

    if (usePairingCode && !arap.authState.creds.registered) {
        console.log('Silahkan Masukkan Nomor Berawal Dari 62:')
        const phoneNumber = await question('');
        const code = await arap.requestPairingCode(phoneNumber.trim())
        console.log(`Pairing Code : ${code}`)
    }

    arap.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    arap.ev.on("creds.update", saveCreds);

    arap.ev.on('messages.upsert', async chatUpdate => {
        try {
            let mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') return
            if (!arap.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            let m = smsg(arap, mek, store)
            require("./arap")(arap, m, mek, store)
        } catch (err) {
            console.log(err)
        }
    })

    arap.public = true

    arap.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !usePairingCode) {
            console.log(chalk.magenta('Pindai QR code ini dengan WhatsApp Anda...'));
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            const reasonText = DisconnectReason[reason] || 'Tidak Diketahui';
            console.log(chalk.redBright(`Koneksi Tertutup, Alasan: ${reasonText} (${reason})`));

            if (
                reason === DisconnectReason.badSession ||
                reason === DisconnectReason.loggedOut ||
                reason === DisconnectReason.connectionReplaced ||
                reason === DisconnectReason.multideviceMismatch
            ) {
                console.log(chalk.red("Error Sesi Kritis. Mematikan bot... Harap hapus folder 'auth' dan mulai ulang."));
                process.exit(1);
            } else {
                console.log(chalk.yellow("Koneksi terputus, mencoba memulai ulang bot..."));
                Botstarted();
            }
        }

        if (connection === "open") {
            console.clear();
            console.log(chalk.red(await figlet.text('YZ BOT', { font: 'Standard' })));
            console.log(chalk.green(`Terhubung sebagai = ` + JSON.stringify(arap.user, null, 2)));
        }
    });

    return arap
}

Botstarted()
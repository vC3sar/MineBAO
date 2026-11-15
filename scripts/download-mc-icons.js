/**
 * MineBAO - Minecraft Icon & Texture Scraper / Extractor
 * Extrae y descarga texturas oficiales de items y bloques de Minecraft
 * para su uso local en el panel de inventario y menús.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const targetDir = path.join(__dirname, '..', 'assets', 'mc-icons');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, dest).then(resolve);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return resolve(false);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', () => {
      try { file.close(); fs.unlinkSync(dest); } catch {}
      resolve(false);
    });
  });
}

async function main() {
  console.log('📦 Verificando texturas locales en assets/mc-icons...');

  // 1. Extracción rápida local si existe el JAR oficial
  const jarPath = path.join(process.env.APPDATA || '', '.minecraft', 'versions', '1.21.1', '1.21.1.jar');
  if (fs.existsSync(jarPath)) {
    console.log('⚡ Extrayendo texturas oficiales desde 1.21.1.jar local...');
    try {
      execSync(`tar.exe -xf "${jarPath}" --strip-components=4 -C "${targetDir}" "assets/minecraft/textures/item"`, { stdio: 'ignore' });
      const blockDir = path.join(targetDir, '_block_tmp');
      fs.mkdirSync(blockDir, { recursive: true });
      execSync(`tar.exe -xf "${jarPath}" --strip-components=4 -C "${blockDir}" "assets/minecraft/textures/block"`, { stdio: 'ignore' });
      for (const f of fs.readdirSync(blockDir)) {
        const dest = path.join(targetDir, f);
        if (!fs.existsSync(dest)) fs.copyFileSync(path.join(blockDir, f), dest);
      }
      fs.rmSync(blockDir, { recursive: true, force: true });
    } catch (e) {
      console.log('ℹ️ No se pudo usar tar.exe, recurriendo a descarga CDN.');
    }
  }

  // 2. Iconos especiales clave (Renders 3D e Isometric)
  const specialRenders = {
    'chest.png': 'https://minecraftitemids.com/item/32/chest.png',
    'ender_chest.png': 'https://minecraftitemids.com/item/32/ender_chest.png',
    'crafting_table.png': 'https://minecraftitemids.com/item/32/crafting_table.png',
    'grass_block.png': 'https://minecraftitemids.com/item/32/grass_block.png',
    'player_head.png': 'https://mc-heads.net/avatar/steve/64.png',
  };

  for (const [file, url] of Object.entries(specialRenders)) {
    const dest = path.join(targetDir, file);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 100) {
      console.log(`⬇️ Descargando render: ${file}...`);
      await downloadFile(url, dest);
    }
  }

  // 3. Compass fallback
  const compassSrc = path.join(targetDir, 'compass_00.png');
  const compassDest = path.join(targetDir, 'compass.png');
  if (fs.existsSync(compassSrc) && !fs.existsSync(compassDest)) {
    fs.copyFileSync(compassSrc, compassDest);
  }

  const total = fs.readdirSync(targetDir).filter((f) => f.endsWith('.png')).length;
  console.log(`✅ Colección completa lista: ${total} texturas en assets/mc-icons/`);
}

main().catch(console.error);

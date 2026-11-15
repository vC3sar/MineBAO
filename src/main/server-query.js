"use strict";

const net = require("net");

function writeVarInt(value) {
  const bytes = [];
  let val = value;
  while (true) {
    if ((val & ~0x7f) === 0) {
      bytes.push(val);
      break;
    }
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let result = 0;
  let numRead = 0;
  let pos = offset;

  while (pos < buffer.length) {
    const read = buffer[pos++];
    const value = read & 0x7f;
    result |= value << (7 * numRead);
    numRead++;

    if (numRead > 5) {
      throw new Error("VarInt is too big");
    }

    if ((read & 0x80) === 0) {
      break;
    }
  }

  return { value: result, bytesRead: numRead };
}

function extractPlainTextMotd(desc) {
  if (!desc) return "";
  if (typeof desc === "string") return desc;
  if (typeof desc === "object") {
    let text = desc.text || "";
    if (Array.isArray(desc.extra)) {
      text += desc.extra.map((e) => (typeof e === "string" ? e : e.text || "")).join("");
    }
    return text;
  }
  return String(desc);
}

function pingMinecraftServer(host, port = 25565, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let hasResolved = false;

    const cleanupAndResolve = (result) => {
      if (hasResolved) return;
      hasResolved = true;
      try {
        socket.destroy();
      } catch {}
      resolve(result);
    };

    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    let receivedBuffer = Buffer.alloc(0);

    socket.connect(port, host, () => {
      try {
        // Build Handshake Packet
        const hostBuf = Buffer.from(host, "utf8");
        const hostLen = writeVarInt(hostBuf.length);
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(port, 0);

        const packetData = Buffer.concat([
          writeVarInt(0x00),       // Packet ID 0
          writeVarInt(767),        // Protocol version (1.21)
          hostLen,
          hostBuf,
          portBuf,
          writeVarInt(1),          // Next state: 1 (status)
        ]);

        const handshakePacket = Buffer.concat([
          writeVarInt(packetData.length),
          packetData,
        ]);

        // Status request packet: length 1, packet ID 0
        const statusRequest = Buffer.from([0x01, 0x00]);

        socket.write(handshakePacket);
        socket.write(statusRequest);
      } catch (err) {
        cleanupAndResolve({
          online: false,
          latency: null,
          error: err.message,
        });
      }
    });

    socket.on("data", (data) => {
      receivedBuffer = Buffer.concat([receivedBuffer, data]);

      try {
        if (receivedBuffer.length < 3) return;

        let offset = 0;
        const packetLengthInfo = readVarInt(receivedBuffer, offset);
        offset += packetLengthInfo.bytesRead;

        if (receivedBuffer.length < offset + packetLengthInfo.value) {
          // Packet not yet complete, wait for more data
          return;
        }

        const packetIdInfo = readVarInt(receivedBuffer, offset);
        offset += packetIdInfo.bytesRead;

        if (packetIdInfo.value !== 0x00) {
          cleanupAndResolve({
            online: false,
            latency: null,
            error: "Respuesta de servidor inválida",
          });
          return;
        }

        const stringLengthInfo = readVarInt(receivedBuffer, offset);
        offset += stringLengthInfo.bytesRead;

        const jsonBytes = receivedBuffer.slice(offset, offset + stringLengthInfo.value);
        const jsonStr = jsonBytes.toString("utf8");

        const latency = Date.now() - startTime;
        const parsed = JSON.parse(jsonStr);

        cleanupAndResolve({
          online: true,
          latency,
          versionName: parsed.version?.name || "Desconocida",
          protocol: parsed.version?.protocol || 0,
          playersOnline: parsed.players?.online ?? 0,
          playersMax: parsed.players?.max ?? 0,
          motd: extractPlainTextMotd(parsed.description),
          favicon: parsed.favicon || null,
        });
      } catch (err) {
        // Continue waiting if buffer is incomplete, unless JSON parse error
        if (err instanceof SyntaxError) {
          cleanupAndResolve({
            online: false,
            latency: null,
            error: "Error parseando estado del servidor",
          });
        }
      }
    });

    socket.on("timeout", () => {
      cleanupAndResolve({
        online: false,
        latency: null,
        error: "Tiempo de espera agotado (Timeout)",
      });
    });

    socket.on("error", (err) => {
      cleanupAndResolve({
        online: false,
        latency: null,
        error: err.code === "ECONNREFUSED" ? "Servidor no responde (Conexión rechazada)" : err.message,
      });
    });

    socket.on("close", () => {
      if (!hasResolved) {
        cleanupAndResolve({
          online: false,
          latency: null,
          error: "Conexión cerrada prematuramente",
        });
      }
    });
  });
}

module.exports = {
  pingMinecraftServer,
};

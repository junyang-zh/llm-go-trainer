// Minimal stored ZIP fixture; avoids an extra archive writer dependency.
export function zip(name: string, symlink = false) {
  const filename = Buffer.from(name),
    data = Buffer.from('abc');
  const local = Buffer.alloc(30),
    central = Buffer.alloc(46),
    end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(0x352441c2, 14);
  local.writeUInt32LE(3, 18);
  local.writeUInt32LE(3, 22);
  local.writeUInt16LE(filename.length, 26);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(0x352441c2, 16);
  central.writeUInt32LE(3, 20);
  central.writeUInt32LE(3, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt32LE(((symlink ? 0xa1ff : 0x81a4) << 16) >>> 0, 38);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + data.length, 16);
  return Buffer.concat([local, filename, data, central, filename, end]);
}

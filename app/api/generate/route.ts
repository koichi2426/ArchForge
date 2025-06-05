import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

export async function POST(req: NextRequest) {
  const data = await req.json();
  const zip = new JSZip();
  // ダミーファイルを追加（本来はdataを使って動的生成）
  zip.file('README.txt', 'プロジェクト名: ' + data.projectName);
  const content = await zip.generateAsync({ type: 'uint8array' });
  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="project.zip"',
    },
  });
} 
import JSZip from 'jszip';

export async function makeDeck(options: { badRelationship?: boolean } = {}) {
  const zip = new JSZip();
  const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const r =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = (items: string) =>
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
  const relationship = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="${r}/${type}" Target="${target}"/>`;
  zip.file(
    '[Content_Types].xml',
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    rels(relationship('rId1', 'officeDocument', 'ppt/presentation.xml')),
  );
  zip.file(
    'ppt/presentation.xml',
    `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="first"/><p:sldId id="257" r:id="second"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`,
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    rels(
      relationship(
        'first',
        'slide',
        options.badRelationship ? '../../../outside.xml' : 'slides/slide7.xml',
      ) + relationship('second', 'slide', 'slides/slide2.xml'),
    ),
  );
  for (const [number, text] of [
    [7, 'Pocket Presenter'],
    [2, 'Second slide'],
  ] as const) {
    zip.file(
      `ppt/slides/slide${number}.xml`,
      `<p:sld xmlns:p="${p}" xmlns:a="${a}"${number === 2 ? ' show="0"' : ''}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="8000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3600"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    );
  }
  zip.file(
    'ppt/slides/_rels/slide7.xml.rels',
    rels(relationship('notes', 'notesSlide', '../notesSlides/notesSlide9.xml')),
  );
  zip.file(
    'ppt/notesSlides/notesSlide9.xml',
    `<p:notes xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>First paragraph.</a:t></a:r></a:p><a:p><a:r><a:t>Second line.</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>7</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib'

export interface Env {
  // Define your environment variables here
}

interface ProjectData {
  projectName: string;
  submittedTo: string;
  preparedBy: string;
  date: string;
  projectNumber?: string;
  emailAddress: string;
  phoneNumber: string;
  product: string;
  status: {
    forReview: boolean;
    forApproval: boolean;
    forRecord: boolean;
    forInformationOnly: boolean;
  };
  submittalType: {
    tds: boolean;
    threePartSpecs: boolean;
    testReportIccEsr5194: boolean;
    testReportIccEsl1645: boolean;
    fireAssembly: boolean;
    fireAssembly01: boolean;
    fireAssembly02: boolean;
    fireAssembly03: boolean;
    msds: boolean;
    leedGuide: boolean;
    installationGuide: boolean;
    warranty: boolean;
    samples: boolean;
    other: boolean;
    otherText?: string;
  };
}

interface DocumentRequest {
  id: string;
  name: string;
  url: string;
  type: string;
}

interface GeneratePacketRequest {
  projectData: ProjectData;
  documents: DocumentRequest[];
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/generate-packet') {
      try {
        const { projectData, documents }: GeneratePacketRequest = await request.json()

        console.log(`Generating packet for: ${projectData.projectName}`)
        console.log(`Processing ${documents.length} documents`)

        // Load the template PDF and fill it
        const finalPdf = await loadAndFillTemplate(projectData)

        let currentPageNumber = finalPdf.getPageCount() + 1 // Start after template pages

        // Process each document
        for (const doc of documents) {
          try {
            console.log(`Processing: ${doc.name}`)

            // Add divider page
            await addDividerPage(finalPdf, doc.name, doc.type, currentPageNumber)
            currentPageNumber++

            // Fetch and merge PDF
            const pdfBytes = await fetchPDF(doc.url)
            if (pdfBytes) {
              const sourcePdf = await PDFDocument.load(pdfBytes)
              const pageIndices = sourcePdf.getPageIndices()

              // Copy pages one by one for better error handling
              for (let i = 0; i < pageIndices.length; i++) {
                try {
                  const [copiedPage] = await finalPdf.copyPages(sourcePdf, [pageIndices[i]])
                  finalPdf.addPage(copiedPage)
                  currentPageNumber++
                } catch (pageError) {
                  console.warn(`Failed to copy page ${i + 1} from ${doc.name}:`, pageError)
                  // Add error page instead
                  await addErrorPage(finalPdf, doc.name, `Page ${i + 1} could not be processed`)
                  currentPageNumber++
                }
              }

              console.log(`Successfully processed ${pageIndices.length} pages from ${doc.name}`)
            } else {
              // Add error page if PDF couldn't be loaded
              await addErrorPage(finalPdf, doc.name, 'Document could not be loaded')
              currentPageNumber++
            }
          } catch (docError) {
            console.error(`Error processing ${doc.name}:`, docError)
            await addErrorPage(finalPdf, doc.name, 'Document processing failed')
            currentPageNumber++
          }
        }

        // Add page numbers to all pages
        await addPageNumbers(finalPdf)

        // Generate final PDF
        const pdfBytes = await finalPdf.save()

        console.log(`Packet generated successfully: ${pdfBytes.length} bytes`)

        return new Response(pdfBytes, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${projectData.projectName.replace(/[^a-zA-Z0-9]/g, '_')}_Packet.pdf"`,
            'Content-Length': pdfBytes.length.toString(),
          },
        })

      } catch (error) {
        console.error('Error generating packet:', error)
        return new Response(JSON.stringify({
          error: 'Failed to generate packet',
          details: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response('PDF Packet Generator Worker', {
      headers: corsHeaders,
    })
  },
}

async function fetchPDF(url: string): Promise<ArrayBuffer | null> {
  try {
    // Convert relative URL to properly encoded GitHub raw URL
    let fullUrl = url
    if (!url.startsWith('http')) {
      // Remove leading slash if present
      const cleanPath = url.startsWith('/') ? url.substring(1) : url
      // Properly encode the URL components
      const encodedPath = encodeURIComponent(cleanPath).replace(/%2F/g, '/')
      fullUrl = `https://raw.githubusercontent.com/karthikeyanasha24/pdf-packet-6/main/public/${encodedPath}`
    }

    console.log(`Fetching PDF from: ${fullUrl}`)

    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'PDF-Packet-Generator/1.0',
      }
    })

    if (!response.ok) {
      console.error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
      console.error(`URL attempted: ${fullUrl}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    console.log(`PDF fetched successfully: ${arrayBuffer.byteLength} bytes`)
    return arrayBuffer
  } catch (error) {
    console.error(`Error fetching PDF from ${url}:`, error)
    return null
  }
}

async function loadAndFillTemplate(projectData: ProjectData): Promise<PDFDocument> {
  try {
    // Fetch the template PDF from GitHub
    const templateUrl = 'https://raw.githubusercontent.com/karthikeyanasha24/pdf-packet-6/main/PDF-TEMPLATE/Submittal%20Form_Floor%20Panels.pdf'
    console.log('Fetching template PDF from:', templateUrl)

    const response = await fetch(templateUrl, {
      headers: {
        'User-Agent': 'PDF-Packet-Generator/1.0',
      }
    })

    if (!response.ok) {
      console.error(`Failed to fetch template: ${response.status} ${response.statusText}`)
      // Fallback to creating a custom cover page
      const pdf = await PDFDocument.create()
      await addCoverPage(pdf, projectData)
      return pdf
    }

    const templateBytes = await response.arrayBuffer()
    console.log(`Template fetched successfully: ${templateBytes.byteLength} bytes`)

    // Load the template PDF
    const pdfDoc = await PDFDocument.load(templateBytes)

    // Get the form from the template
    const form = pdfDoc.getForm()
    const fields = form.getFields()

    console.log(`Template has ${fields.length} form fields`)
    fields.forEach(field => {
      console.log(`Field: ${field.getName()} - Type: ${field.constructor.name}`)
    })

    // Fill in the form fields
    try {
      // Try to fill fields by their names (common field names in PDF forms)
      const fieldMappings = [
        { names: ['Submitted To', 'submittedTo', 'submitted_to'], value: projectData.submittedTo },
        { names: ['Project Name', 'projectName', 'project_name'], value: projectData.projectName },
        { names: ['Project Number', 'projectNumber', 'project_number'], value: projectData.projectNumber || '' },
        { names: ['Prepared By', 'preparedBy', 'prepared_by'], value: projectData.preparedBy },
        { names: ['Phone/Email', 'phoneEmail', 'phone_email', 'PhoneEmail'], value: `${projectData.phoneNumber} / ${projectData.emailAddress}` },
        { names: ['Date', 'date'], value: projectData.date },
      ]

      fieldMappings.forEach(mapping => {
        for (const fieldName of mapping.names) {
          try {
            const field = form.getTextField(fieldName)
            if (field) {
              field.setText(mapping.value)
              console.log(`Set field ${fieldName} to: ${mapping.value}`)
              break
            }
          } catch (e) {
            // Field doesn't exist or isn't a text field, try next name
          }
        }
      })

      // Handle checkboxes for Status/Action
      const statusCheckboxes = [
        { names: ['For Review', 'forReview', 'for_review'], value: projectData.status.forReview },
        { names: ['For Approval', 'forApproval', 'for_approval'], value: projectData.status.forApproval },
        { names: ['For Record', 'forRecord', 'for_record'], value: projectData.status.forRecord },
        { names: ['For Information Only', 'forInformationOnly', 'for_information_only'], value: projectData.status.forInformationOnly },
      ]

      statusCheckboxes.forEach(mapping => {
        for (const fieldName of mapping.names) {
          try {
            const checkbox = form.getCheckBox(fieldName)
            if (checkbox) {
              if (mapping.value) {
                checkbox.check()
              } else {
                checkbox.uncheck()
              }
              console.log(`Set checkbox ${fieldName} to: ${mapping.value}`)
              break
            }
          } catch (e) {
            // Field doesn't exist or isn't a checkbox, try next name
          }
        }
      })

      // Handle checkboxes for Submittal Type
      const submittalCheckboxes = [
        { names: ['TDS', 'tds'], value: projectData.submittalType.tds },
        { names: ['3-Part Specs', '3PartSpecs', 'threePartSpecs'], value: projectData.submittalType.threePartSpecs },
        { names: ['Test Report ICC-ESR 5194', 'testReportIccEsr5194'], value: projectData.submittalType.testReportIccEsr5194 },
        { names: ['Test Report ICC-ESL 1645', 'testReportIccEsl1645'], value: projectData.submittalType.testReportIccEsl1645 },
        { names: ['Fire Assembly', 'fireAssembly'], value: projectData.submittalType.fireAssembly },
        { names: ['Fire Assembly 01', 'fireAssembly01'], value: projectData.submittalType.fireAssembly01 },
        { names: ['Fire Assembly 02', 'fireAssembly02'], value: projectData.submittalType.fireAssembly02 },
        { names: ['Fire Assembly 03', 'fireAssembly03'], value: projectData.submittalType.fireAssembly03 },
        { names: ['MSDS', 'msds', 'Material Safety Data Sheet'], value: projectData.submittalType.msds },
        { names: ['LEED Guide', 'leedGuide'], value: projectData.submittalType.leedGuide },
        { names: ['Installation Guide', 'installationGuide'], value: projectData.submittalType.installationGuide },
        { names: ['Warranty', 'warranty'], value: projectData.submittalType.warranty },
        { names: ['Samples', 'samples'], value: projectData.submittalType.samples },
        { names: ['Other', 'other'], value: projectData.submittalType.other },
      ]

      submittalCheckboxes.forEach(mapping => {
        for (const fieldName of mapping.names) {
          try {
            const checkbox = form.getCheckBox(fieldName)
            if (checkbox) {
              if (mapping.value) {
                checkbox.check()
              } else {
                checkbox.uncheck()
              }
              console.log(`Set checkbox ${fieldName} to: ${mapping.value}`)
              break
            }
          } catch (e) {
            // Field doesn't exist or isn't a checkbox, try next name
          }
        }
      })

      // Flatten the form to make it non-editable
      form.flatten()

    } catch (fillError) {
      console.warn('Error filling form fields:', fillError)
      console.log('Template will be used as-is without filling fields')
    }

    return pdfDoc

  } catch (error) {
    console.error('Error loading template PDF:', error)
    // Fallback: create a custom cover page
    console.log('Falling back to custom cover page')
    const pdf = await PDFDocument.create()
    await addCoverPage(pdf, projectData)
    return pdf
  }
}

async function addCoverPage(pdf: PDFDocument, projectData: ProjectData) {
  const page = pdf.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Colors - NexGen Brand Colors (#00A3CA)
  const nexgenBlue = rgb(0, 0.637, 0.792); // #00A3CA - NexGen brand blue
  const darkGray = rgb(0.13, 0.13, 0.13); // #212121
  const mediumGray = rgb(0.27, 0.27, 0.27); // #444445
  const lightBlue = rgb(0.9, 0.97, 0.98); // Light blue tint for form backgrounds
  const borderGray = rgb(0.7, 0.7, 0.7);

  // NEXGEN Logo Header (top left) - Embed PNG logo
  try {
    const logoUrl = 'https://raw.githubusercontent.com/karthikeyanasha24/pdf-packet-6/main/public/image.png';
    const logoResponse = await fetch(logoUrl);
    if (logoResponse.ok) {
      const logoBytes = await logoResponse.arrayBuffer();
      const logoImage = await pdf.embedPng(logoBytes);
      const logoHeight = 25; // Height in PDF units
      const logoWidth = (logoImage.width / logoImage.height) * logoHeight; // Maintain aspect ratio
      
      page.drawImage(logoImage, {
        x: 50,
        y: height - 55,
        width: logoWidth,
        height: logoHeight,
      });
    } else {
      // Fallback to text if logo can't be loaded
      page.drawText('NEXGEN', {
        x: 50,
        y: height - 50,
        size: 24,
        font: boldFont,
        color: nexgenBlue,
      });
    }
  } catch (error) {
    console.warn('Failed to load logo, using text fallback:', error);
    // Fallback to text if logo can't be loaded
    page.drawText('NEXGEN', {
      x: 50,
      y: height - 50,
      size: 24,
      font: boldFont,
      color: nexgenBlue,
    });
  }

  // Section identifier (top right) - Using brand blue
  const sectionText = 'SECTION 06 16 26';
  const sectionWidth = font.widthOfTextAtSize(sectionText, 10);
  page.drawRectangle({
    x: width - 150,
    y: height - 60,
    width: 100,
    height: 20,
    color: nexgenBlue,
  });
  page.drawText(sectionText, {
    x: width - 145,
    y: height - 54,
    size: 10,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  // Title
  const titleY = height - 100;
  page.drawText('MAXTERRA® MgO Non-Combustible Structural', {
    x: 50,
    y: titleY,
    size: 12,
    font: font,
    color: darkGray,
  });
  page.drawText('Floor Panels Submittal Form', {
    x: 50,
    y: titleY - 15,
    size: 12,
    font: font,
    color: darkGray,
  });

  // Form fields start position
  let currentY = titleY - 50;
  const labelX = 50;
  const valueX = 200;
  const fieldHeight = 25;
  const fieldWidth = width - valueX - 50;

  // Helper function to draw form field
  const drawFormField = (label: string, value: string, y: number) => {
    // Label
    page.drawText(label, {
      x: labelX,
      y: y + 8,
      size: 10,
      font: font,
      color: darkGray,
    });

    // Background box
    page.drawRectangle({
      x: valueX,
      y: y,
      width: fieldWidth,
      height: fieldHeight,
      color: lightBlue,
      borderColor: borderGray,
      borderWidth: 0.5,
    });

    // Value text
    page.drawText(value || '', {
      x: valueX + 5,
      y: y + 8,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Bottom border line
    page.drawLine({
      start: { x: labelX, y: y },
      end: { x: valueX + fieldWidth, y: y },
      color: borderGray,
      thickness: 0.5,
    });
  };

  // Draw form fields
  drawFormField('Submitted To', projectData.submittedTo, currentY);
  currentY -= fieldHeight;

  drawFormField('Project Name', projectData.projectName, currentY);
  currentY -= fieldHeight;

  drawFormField('Project Number', projectData.projectNumber || '', currentY);
  currentY -= fieldHeight;

  drawFormField('Prepared By', projectData.preparedBy, currentY);
  currentY -= fieldHeight;

  drawFormField('Phone/Email', `${projectData.phoneNumber} / ${projectData.emailAddress}`, currentY);
  currentY -= fieldHeight;

  drawFormField('Date', projectData.date, currentY);
  currentY -= fieldHeight + 10;

  // Status/Action section with checkboxes
  page.drawText('Status / Action', {
    x: labelX,
    y: currentY,
    size: 10,
    font: boldFont,
    color: darkGray,
  });
  currentY -= 20;

  const checkboxSize = 12;
  const checkboxSpacing = 130;
  let checkboxX = valueX;

  const drawCheckbox = (label: string, checked: boolean, x: number, y: number) => {
    // Checkbox border
    page.drawRectangle({
      x: x,
      y: y,
      width: checkboxSize,
      height: checkboxSize,
      borderColor: borderGray,
      borderWidth: 1,
    });

    // Checkbox background if checked
    if (checked) {
      page.drawRectangle({
        x: x + 2,
        y: y + 2,
        width: checkboxSize - 4,
        height: checkboxSize - 4,
        color: nexgenBlue,
      });

      // X mark
      page.drawText('X', {
        x: x + 3,
        y: y + 2,
        size: 9,
        font: boldFont,
        color: rgb(1, 1, 1),
      });
    }

    // Label
    page.drawText(label, {
      x: x + checkboxSize + 5,
      y: y + 2,
      size: 9,
      font: font,
      color: darkGray,
    });
  };

  drawCheckbox('For Review', projectData.status.forReview, checkboxX, currentY);
  drawCheckbox('For Approval', projectData.status.forApproval, checkboxX + checkboxSpacing, currentY);
  currentY -= 18;
  drawCheckbox('For Record', projectData.status.forRecord, checkboxX, currentY);
  drawCheckbox('For Information Only', projectData.status.forInformationOnly, checkboxX + checkboxSpacing, currentY);

  currentY -= 30;

  // Submittal Type section
  page.drawText('Submittal Type (check all that apply)', {
    x: labelX,
    y: currentY,
    size: 10,
    font: boldFont,
    color: darkGray,
  });
  currentY -= 20;

  const submittalTypes = [
    { label: 'TDS', checked: projectData.submittalType.tds },
    { label: '3-Part Specs', checked: projectData.submittalType.threePartSpecs },
    { label: 'Test Report ICC-ESR 5194', checked: projectData.submittalType.testReportIccEsr5194 },
    { label: 'Test Report ICC-ESL 1645', checked: projectData.submittalType.testReportIccEsl1645 },
    { label: 'Fire Assembly', checked: projectData.submittalType.fireAssembly },
    { label: '  Fire Assembly 01', checked: projectData.submittalType.fireAssembly01 },
    { label: '  Fire Assembly 02', checked: projectData.submittalType.fireAssembly02 },
    { label: '  Fire Assembly 03', checked: projectData.submittalType.fireAssembly03 },
    { label: 'Material Safety Data Sheet (MSDS)', checked: projectData.submittalType.msds },
    { label: 'LEED Guide', checked: projectData.submittalType.leedGuide },
    { label: 'Installation Guide', checked: projectData.submittalType.installationGuide },
    { label: 'Warranty', checked: projectData.submittalType.warranty },
    { label: 'Samples', checked: projectData.submittalType.samples },
    { label: `Other: ${projectData.submittalType.otherText || ''}`, checked: projectData.submittalType.other },
  ];

  submittalTypes.forEach((type) => {
    drawCheckbox(type.label, type.checked, valueX, currentY);
    currentY -= 16;
  });

  currentY -= 10;

  // Product section
  page.drawText('Product:', {
    x: labelX,
    y: currentY,
    size: 10,
    font: boldFont,
    color: darkGray,
  });
  page.drawText(projectData.product, {
    x: valueX,
    y: currentY,
    size: 10,
    font: font,
    color: darkGray,
  });

  // Footer section
  const footerY = 120;
  page.drawText('NEXGEN® Building Products, LLC', {
    x: labelX,
    y: footerY,
    size: 9,
    font: boldFont,
    color: darkGray,
  });
  page.drawText('1504 Manhattan Ave West, #300 Brandon, FL 34205', {
    x: labelX,
    y: footerY - 12,
    size: 8,
    font: font,
    color: mediumGray,
  });
  page.drawText('(727) 634-5534', {
    x: labelX,
    y: footerY - 24,
    size: 8,
    font: font,
    color: mediumGray,
  });
  page.drawText('Technical Support: support@nexgenbp.com', {
    x: labelX,
    y: footerY - 36,
    size: 8,
    font: font,
    color: mediumGray,
  });

  // Version footer
  const versionText = 'Version 1.0 October 2025 © 2025 NEXGEN Building Products';
  const versionWidth = font.widthOfTextAtSize(versionText, 7);
  page.drawText(versionText, {
    x: width - versionWidth - 50,
    y: 50,
    size: 7,
    font: font,
    color: mediumGray,
  });
}

async function addDividerPage(pdf: PDFDocument, documentName: string, documentType: string, pageNumber: number) {
  const page = pdf.addPage(PageSizes.Letter)
  const { width, height } = page.getSize()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)

  const nexgenBlue = rgb(0, 0.637, 0.792); // #00A3CA - NexGen brand blue
  const darkGray = rgb(0.08, 0.08, 0.08); // #141414 - Dark background
  const orange = rgb(0.93, 0.39, 0.15); // #EE6325 - Orange gradient start
  const white = rgb(1, 1, 1); // White text

  // Black background for entire page
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: height,
    color: rgb(0, 0, 0),
  })

  // Top dark gray header bar (height: 96.75)
  page.drawRectangle({
    x: 0,
    y: height - 96.75,
    width: width,
    height: 96.75,
    color: darkGray,
  })

  // NEXGEN Logo in top header (using blue/cyan logo on dark background)
  try {
    const logoUrl = 'https://raw.githubusercontent.com/karthikeyanasha24/pdf-packet-6/main/public/image-white.png';
    const logoResponse = await fetch(logoUrl);
    if (logoResponse.ok) {
      const logoBytes = await logoResponse.arrayBuffer();
      const logoImage = await pdf.embedPng(logoBytes);
      const logoHeight = 30;
      const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
      
      page.drawImage(logoImage, {
        x: 15,
        y: height - 70,
        width: logoWidth,
        height: logoHeight,
      });
    } else {
      // Fallback text
      page.drawText('NEXGEN', {
        x: 15,
        y: height - 55,
        size: 24,
        font: boldFont,
        color: nexgenBlue,
      });
    }
  } catch (error) {
    // Fallback text
    page.drawText('NEXGEN', {
      x: 15,
      y: height - 55,
      size: 24,
      font: boldFont,
      color: nexgenBlue,
    });
  }

  page.drawText('Package Section Divider', {
    x: 15,
    y: height - 82,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  })

  // Orange gradient bar (height: 9) - simulating gradient with solid orange
  page.drawRectangle({
    x: 0,
    y: height - 105.75,
    width: width,
    height: 9,
    color: orange,
  })

  // White content area
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: height - 105.75,
    color: white,
  })

  // "Section Divider" text (top: 134px from top, left: 74px based on your design)
  const contentStartY = height - 180;
  page.drawText('Section Divider', {
    x: 74,
    y: contentStartY,
    size: 32,
    font: font,
    color: rgb(0, 0, 0),
  })

  // Document name (LEED Credit Guide / Technical Data Sheet style)
  page.drawText(documentName, {
    x: 74,
    y: contentStartY - 50,
    size: 40,
    font: boldFont,
    color: rgb(0, 0, 0),
  })

  // Page number at bottom
  page.drawText(`Page ${pageNumber}`, {
    x: 42,
    y: 60,
    size: 10,
    font: font,
    color: rgb(0.4, 0.4, 0.4),
  })

  // Footer with copyright (matching design)
  const footerText = '© 2025 NEXGEN Building Products';
  const footerWidth = font.widthOfTextAtSize(footerText, 9);
  page.drawText(footerText, {
    x: width - footerWidth - 42,
    y: 40,
    size: 9,
    font: font,
    color: white,
  })

  // Blue footer bar at bottom
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: 30,
    color: nexgenBlue,
  })

  page.drawText(footerText, {
    x: width / 2 - footerWidth / 2,
    y: 12,
    size: 9,
    font: font,
    color: white,
  })
}

async function addErrorPage(pdf: PDFDocument, documentName: string, errorMessage: string) {
  const page = pdf.addPage(PageSizes.Letter)
  const { width, height } = page.getSize()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Error header
  page.drawText('DOCUMENT ERROR', {
    x: 50,
    y: height - 100,
    size: 16,
    font: boldFont,
    color: rgb(0.8, 0.2, 0.2),
  })

  // Document name
  page.drawText(documentName, {
    x: 50,
    y: height - 150,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  })

  // Error message
  page.drawText(`Error: ${errorMessage}`, {
    x: 50,
    y: height - 180,
    size: 12,
    font: font,
    color: rgb(0.6, 0.2, 0.2),
  })

  // Instructions
  page.drawText('Please contact support if this error persists.', {
    x: 50,
    y: height - 220,
    size: 10,
    font: font,
    color: rgb(0.4, 0.4, 0.4),
  })
}

async function addPageNumbers(pdf: PDFDocument) {
  const pages = pdf.getPages()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  pages.forEach((page, index) => {
    const { width } = page.getSize()
    const pageNumber = index + 1

    page.drawText(`${pageNumber}`, {
      x: width - 50,
      y: 30,
      size: 10,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    })
  })
}

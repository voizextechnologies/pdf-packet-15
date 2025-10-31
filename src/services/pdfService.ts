import type { ProjectFormData, SelectedDocument, Document } from '@/types'

// Server-side PDF processing using Cloudflare Workers
export class PDFService {
  private workerUrl: string

  constructor() {
    // Use environment variable or fallback to local development
    this.workerUrl = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'
  }

  /**
   * Generate PDF packet using Cloudflare Worker (server-side processing)
   */
  async generatePacket(
    formData: Partial<ProjectFormData>,
    selectedDocuments: SelectedDocument[]
  ): Promise<Uint8Array> {
    try {
      // Filter and sort selected documents
      const sortedDocs = selectedDocuments
        .filter(doc => doc.selected)
        .sort((a, b) => a.order - b.order)

      if (sortedDocs.length === 0) {
        throw new Error('No documents selected for packet generation')
      }

      // Prepare request data for the worker
      const requestData = {
        projectData: {
          projectName: formData.projectName || 'Untitled Project',
          submittedTo: formData.submittedTo || 'N/A',
          preparedBy: formData.preparedBy || 'N/A',
          date: formData.date || new Date().toLocaleDateString(),
          projectNumber: formData.projectNumber || 'N/A',
          emailAddress: formData.emailAddress || 'N/A',
          phoneNumber: formData.phoneNumber || 'N/A',
          product: formData.product || '3/4-in (20mm)',
          status: formData.status || {
            forReview: false,
            forApproval: false,
            forRecord: false,
            forInformationOnly: false,
          },
          submittalType: formData.submittalType || {
            tds: false,
            threePartSpecs: false,
            testReportIccEsr5194: false,
            testReportIccEsl1645: false,
            fireAssembly: false,
            fireAssembly01: false,
            fireAssembly02: false,
            fireAssembly03: false,
            msds: false,
            leedGuide: false,
            installationGuide: false,
            warranty: false,
            samples: false,
            other: false,
          },
        },
        documents: sortedDocs.map(doc => ({
          id: doc.id,
          name: doc.document.name,
          url: doc.document.url,
          type: doc.document.type,
        }))
      }

      console.log('Sending request to worker:', this.workerUrl)
      console.log('Request data:', requestData)

      // Send request to Cloudflare Worker
      const response = await fetch(`${this.workerUrl}/generate-packet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Worker request failed: ${response.status} ${response.statusText} - ${errorText}`)
      }

      // Get PDF bytes from response
      const pdfBytes = await response.arrayBuffer()
      
      if (pdfBytes.byteLength === 0) {
        throw new Error('Received empty PDF from worker')
      }

      console.log(`PDF generated successfully: ${pdfBytes.byteLength} bytes`)
      
      return new Uint8Array(pdfBytes)

    } catch (error) {
      console.error('Error generating packet:', error)

      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(
          `Cannot connect to PDF Worker at ${this.workerUrl}. ` +
          `Please ensure the worker is running by executing 'npm run dev' in the project root, ` +
          `which will start both the frontend and worker simultaneously.`
        )
      }

      throw new Error(`Failed to generate PDF packet: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Fetch document metadata dynamically
   */
  async fetchDocuments(): Promise<Document[]> {
    try {
      const response = await fetch('/documents.json')
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.status} ${response.statusText}`)
      }
      const documents = await response.json()
      return documents
    } catch (error) {
      console.error('Error fetching documents:', error)
      throw new Error(`Failed to fetch document metadata: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Download PDF to user's device
   */
  downloadPDF(pdfBytes: Uint8Array, filename: string): void {
    try {
      // Create blob from PDF bytes
      const arrayBuffer = new ArrayBuffer(pdfBytes.length)
      const view = new Uint8Array(arrayBuffer)
      view.set(pdfBytes)
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      throw new Error('Failed to download PDF')
    }
  }

  /**
   * Preview PDF in new tab
   */
  previewPDF(pdfBytes: Uint8Array): void {
    try {
      // Create blob from PDF bytes
      const arrayBuffer = new ArrayBuffer(pdfBytes.length)
      const view = new Uint8Array(arrayBuffer)
      view.set(pdfBytes)
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
      
      // Open in new tab
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (error) {
      console.error('Error previewing PDF:', error)
      throw new Error('Failed to preview PDF')
    }
  }
}

// Export singleton instance
export const pdfService = new PDFService()
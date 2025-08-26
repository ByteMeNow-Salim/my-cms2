// src/services/ViewService.js
import { SysSettingsService } from './SysSettingsService.js';

export class ViewService {
  constructor(env = null) {
    this.env = env;
    this.r2 = env?.R2;
    this.sysSettings = env ? new SysSettingsService(env) : null;
  }

  async getR2PublicUrl() {
    if (!this.sysSettings) return 'https://pub-0852f3a82b534b18991316b054236b23.r2.dev';
    try {
      const r2Config = await this.sysSettings.getR2Config();
      return r2Config.public_url || 'https://pub-0852f3a82b534b18991316b054236b23.r2.dev';
    } catch (error) {
      console.warn('Using fallback R2 URL in ViewService:', error);
      return 'https://pub-0852f3a82b534b18991316b054236b23.r2.dev';
    }
  }

  async getDisplayDomain() {
    console.log('🔧 getDisplayDomain called, sysSettings:', !!this.sysSettings);
    
    if (!this.sysSettings) {
      console.warn('⚠️ No sysSettings available, using fallback domain');
      return 'cfsalim.com';  // Use your actual domain as fallback
    }
    
    try {
      const clientInfo = await this.sysSettings.getClientInfo();
      console.log('📋 ClientInfo loaded:', clientInfo);
      const domain = clientInfo?.domain || 'cfsalim.com';
      console.log('🌐 Display domain resolved to:', domain);
      return domain;
    } catch (error) {
      console.warn('❌ Error getting display domain:', error);
      return 'cfsalim.com';
    }
  }

  async getDynamicDisplayUrl(filename) {
    if (!filename) return '';
    if (filename.startsWith('http')) return filename;
    const displayDomain = await this.getDisplayDomain();
    return `https://${displayDomain}/${filename}`;
  }

  // Non-async version for use in map() callbacks - uses cached domain
  getDynamicDisplayUrlSync(filename, cachedDomain = 'localhost') {
    if (!filename) return '';
    if (filename.startsWith('http')) return filename;
    return `https://${cachedDomain}/${filename}`;
  }
  renderListPage(result, config) {
    // Handle both paginated and non-paginated results
    let items, pagination = null;
    
    if (result && typeof result === 'object' && result.items && result.pagination) {
      // Paginated result from D1
      items = result.items;
      pagination = result.pagination;
    } else if (Array.isArray(result)) {
      // Direct array result
      items = result;
    } else {
      // Fallback for unexpected format
      console.error('Unexpected result format in renderListPage:', result);
      items = [];
    }

    const tableRows = items.map(item => {
      const id = item[config.id_field];
      // Default to true if has_details is not specified, for backwards compatibility.
      const hasDetails = config.has_details !== false;
      const detailsLink = hasDetails ? ` <a href="/${config.path}/${id}/details" class="details-link">Details</a>` : '';

      return `
      <tr>
        ${config.columns.map(column => `<td style="width: ${column.width || 'auto'};">${item[column.name] || ''}</td>`).join('')}
        <td>
          <a href="/${config.path}/${id}/edit">Edit</a>${detailsLink}
          <a href="/${config.path}/${id}/delete" class="delete-link">Delete</a>
        </td>
      </tr>
      `
    }).join('');

    const tableHeaders = config.columns.map(column => `<th style="width: ${column.width || 'auto'};">${column.label}</th>`).join('');

    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-g">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${config.label}</title>
        <link rel="stylesheet" href="/sys-dashboard.css">
      </head>
      <body>
        <div class="container">
          <div class="page-header">
            <h1>${config.label}</h1>
            <div class="page-actions">
              <a href="/dashboard">Back</a>
              <a href="/${config.path}/new">New</a>
              <a href="#">Search</a>
              <a href="#">Sort</a>
              <a href="/dashboard">Home</a>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                ${tableHeaders}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          ${pagination ? this.renderPaginationControls(pagination, null, config.path) : ''}
        </div>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  renderPaginationControls(pagination, url, modulePath) {
    if (!pagination) return '';
    
    const { current_page, total_pages, has_previous, has_next, page_size } = pagination;
    
    return `
      <div class="pagination-container">
        <div class="pagination-info">
          Page ${current_page} of ${total_pages} (${pagination.total_count} total items)
        </div>
        <div class="pagination-controls">
          ${has_previous ? `<a href="/${modulePath}?page=${current_page - 1}&page_size=${page_size}" class="pagination-link">&lt; Previous</a>` : '<span class="pagination-link disabled">&lt; Previous</span>'}
          ${this.generatePageNumbers(current_page, total_pages, modulePath, page_size)}
          ${has_next ? `<a href="/${modulePath}?page=${current_page + 1}&page_size=${page_size}" class="pagination-link">Next &gt;</a>` : '<span class="pagination-link disabled">Next &gt;</span>'}
        </div>
      </div>
    `;
  }

  generatePageNumbers(currentPage, totalPages, modulePath, pageSize) {
    const pages = [];
    const maxVisiblePages = 5; // Show max 5 page numbers at a time
    
    // Calculate start and end page numbers
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Add first page and ellipsis if needed
    if (startPage > 1) {
      pages.push(`<a href="/${modulePath}?page=1&page_size=${pageSize}" class="pagination-link">1</a>`);
      if (startPage > 2) {
        pages.push('<span class="pagination-link disabled">...</span>');
      }
    }
    
    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
      if (i === currentPage) {
        pages.push(`<span class="pagination-link active">${i}</span>`);
      } else {
        pages.push(`<a href="/${modulePath}?page=${i}&page_size=${pageSize}" class="pagination-link">${i}</a>`);
      }
    }
    
    // Add last page and ellipsis if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push('<span class="pagination-link disabled">...</span>');
      }
      pages.push(`<a href="/${modulePath}?page=${totalPages}&page_size=${pageSize}" class="pagination-link">${totalPages}</a>`);
    }
    
    return pages.join('');
  }

  async renderDeleteConfirmationPage(modulePath, id, config) {
    const body = `
      <h1>Confirm Deletion</h1>
      <p>Are you sure you want to delete this item?</p>
      <form method="POST" action="/${modulePath}/${id}/delete">
        <button type="submit">Yes, delete</button>
        <a href="/${modulePath}">No, cancel</a>
      </form>
    `;
    const html = await this.renderPage(body, `Confirm Delete`);
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  async renderEditPageModern(item, config, formFields, detailInfo = null) {
    // Force modern interface - completely new method
    if (!formFields || !formFields.fields) {
      const errorMessage = `
        <p>Error: Form definition file not found or is invalid. Please check the file at <strong>${detailInfo ? config.detail_form_definition_file : config.form_definition_file}</strong>.</p>
      `;
      const backUrl = detailInfo ? `/${config.path}/${detailInfo.itemId}/details` : `/${config.path}`;
      const body = `
        <h1>Edit ${config.label}</h1>
        ${errorMessage}
        <a href="${backUrl}">Back to List</a>
      `;
      return await this.renderPageModern(body, `Error Editing ${config.label}`);
    }

    const actionUrl = detailInfo ? `/${config.path}/${detailInfo.itemId}/details/${detailInfo.detailId}/edit` : `/${config.path}/${item[config.id_field]}/edit`;
    const backUrl = detailInfo ? `/${config.path}/${detailInfo.itemId}/details` : `/${config.path}`;
    const formHtml = await this.generateFormFieldsHTMLModern(formFields, item);
    const body = `
      <h1>Edit ${config.label} - MODERN INTERFACE</h1>
      <form method="POST" action="${actionUrl}">
        ${formHtml}
        <button type="submit">Save</button>
      </form>
      <a href="${backUrl}">Back to List</a>
    `;
    return await this.renderPageModern(body, `Edit ${config.label}`);
  }

  async renderEditPage(item, config, formFields, detailInfo = null) {
    if (!formFields || !formFields.fields) {
      const errorMessage = `
        <p>Error: Form definition file not found or is invalid. Please check the file at <strong>${detailInfo ? config.detail_form_definition_file : config.form_definition_file}</strong>.</p>
      `;
      const backUrl = detailInfo ? `/${config.path}/${detailInfo.itemId}/details` : `/${config.path}`;
      const body = `
        <h1>Edit ${config.label}</h1>
        ${errorMessage}
        <a href="${backUrl}">Back to List</a>
      `;
      const html = await this.renderPage(body, `Error Editing ${config.label}`);
      return html;
    }

    const actionUrl = detailInfo ? `/${config.path}/${detailInfo.itemId}/details/${detailInfo.detailId}/edit` : `/${config.path}/${item[config.id_field]}/edit`;
    const backUrl = detailInfo ? `/${config.path}/${detailInfo.itemId}/details` : `/${config.path}`;
    const body = `
      <h1>Edit ${config.label}</h1>
      <form method="POST" action="${actionUrl}">
        ${await this.generateFormFieldsHTML(formFields, item)}
        <button type="submit">Save</button>
      </form>
      <a href="${backUrl}">Back to List</a>
    `;
    const html = await this.renderPage(body, `Edit ${config.label}`);
    return html;
  }

  async generateFormFieldsHTMLModern(formFields, item = {}) {
    console.log("🔧 Generating MODERN form fields:", formFields);
    console.log("📦 Item data:", item);
    
    // Pre-fetch display domain for all template usage
    const displayDomain = await this.getDisplayDomain();
    
    const fieldPromises = formFields.fields.map(async field => {
      console.log(`⚙️ Processing field: ${field.name}, type: ${field.input_type || field.type}`);
      let value = item[field.name] || field.default_value || '';
      let inputHtml = '';
      const inputType = field.input_type || field.type || 'text';

      // Handle special default values
      if (value === 'Now()' && inputType === 'Date') {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        value = `${year}-${month}-${day}`;
      }

      switch (inputType) {
        case 'OLE':
        case 'OLE_MULTIPLE':
        case 'ole':
        case 'ole_multiple':
        case 'Image':
        case 'image':
          // Modern OLE implementation with background upload and thumbnails
          const isMultiple = inputType === 'OLE_MULTIPLE' || inputType === 'ole_multiple';
          let currentImagesNewHtml = '';
          
          if (value && value.trim()) {
            const displayDomain = await this.getDisplayDomain();
            const r2PublicUrl = await this.getR2PublicUrl();
            
            if (isMultiple) {
              // Handle multiple images
              let images = [];
              try {
                // Parse JSON array or comma-separated string
                if (value.startsWith('[')) {
                  images = JSON.parse(value);
                } else if (value.includes(',')) {
                  images = value.split(',').map(s => s.trim()).filter(Boolean);
                } else {
                  images = [value];
                }
              } catch (e) {
                images = [value];
              }
              
              if (images.length > 0) {
                const imageGridHtml = images.map((filename, index) => {
                  const displayUrl = filename.startsWith('http') ? filename : `https://${displayDomain}/${filename}`;
                  const displayName = filename.startsWith('http') ? filename.split('/').pop() : filename;
                  const safeName = displayName.replace(/'/g, "\\'");
                  
                  return `
                    <div id="${field.name}-img-${index}" data-filename="${displayName}" style="position: relative !important; display: inline-block !important; margin: 5px !important;">
                      <img src="${displayUrl}" alt="Image ${index + 1}" class="ole-preview-img" data-field="${field.name}" data-index="${index}" style="width: 80px !important; height: 80px !important; object-fit: cover !important; border-radius: 8px !important; border: 2px solid #fff !important; box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; cursor: pointer !important;" title="Click to preview">
                      <div class="ole-delete-btn" data-field="${field.name}" data-index="${index}" style="position: absolute !important; top: -5px !important; right: -5px !important; background: #dc3545 !important; color: white !important; border-radius: 50% !important; width: 20px !important; height: 20px !important; font-size: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important;" title="Remove">×</div>
                    </div>
                  `;
                }).join('');
                
                currentImagesNewHtml = `
                  <div id="${field.name}-images-container" style="margin-bottom: 15px !important; padding: 15px !important; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%) !important; border-radius: 10px !important; border: 2px dashed #007bff !important;">
                    <div style="display: flex !important; align-items: center !important; justify-content: space-between !important; margin-bottom: 10px !important;">
                      <div style="display: flex !important; align-items: center !important;">
                        <span style="font-size: 18px !important; margin-right: 8px !important; color: #007bff !important;">🖼️</span>
                        <span style="font-weight: 600 !important; color: #333 !important;">Current Images (<span id="${field.name}-image-count">${images.length}</span>)</span>
                      </div>
                      <button type="button" class="ole-clear-all-btn" data-field="${field.name}" style="background: #dc3545 !important; color: white !important; border: none !important; border-radius: 4px !important; padding: 4px 8px !important; cursor: pointer !important; font-size: 12px !important;" title="Remove all images">Clear All</button>
                    </div>
                    <div id="${field.name}-image-grid" style="display: flex !important; flex-wrap: wrap !important; gap: 5px !important;">
                      ${imageGridHtml}
                    </div>
                  </div>
                `;
              }
            } else {
              // Handle single image
              const displayUrl = value.startsWith('http') ? value : `https://${displayDomain}/${value}`;
              const displayName = value.startsWith('http') ? value.split('/').pop() : value;
              
              currentImagesNewHtml = `
              <div style="margin-bottom: 15px !important; padding: 15px !important; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%) !important; border-radius: 10px !important; border: 2px dashed #007bff !important;">
                <div style="display: flex !important; align-items: center !important; margin-bottom: 10px !important;">
                  <span style="font-size: 18px !important; margin-right: 8px !important; color: #007bff !important;">🖼️</span>
                  <span style="font-weight: 600 !important; color: #333 !important;">Current Image</span>
                  <button type="button" class="ole-clear-single-btn" data-field="${field.name}" style="margin-left: auto !important; background: #dc3545 !important; color: white !important; border: none !important; border-radius: 50% !important; width: 24px !important; height: 24px !important; cursor: pointer !important; font-size: 14px !important;" title="Remove image">×</button>
                </div>
                <div style="display: flex !important; gap: 15px !important; align-items: center !important;">
                  <div class="ole-preview-single" data-field="${field.name}" data-url="${displayUrl}" style="flex-shrink: 0 !important; cursor: pointer !important;">
                      <img src="${displayUrl}" alt="Preview" style="width: 80px !important; height: 80px !important; object-fit: cover !important; border-radius: 8px !important; border: 2px solid #fff !important; box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; display: block !important; background: #f0f0f0 !important; cursor: pointer !important;" title="Click to preview">
                  </div>
                  <div style="flex: 1 !important;">
                    <div style="display: flex !important; align-items: center !important; margin-bottom: 5px !important;">
                      <span style="font-size: 16px !important; margin-right: 6px !important; color: #007bff !important;">📁</span>
                      <a href="javascript:void(0)" class="ole-preview-link" data-field="${field.name}" data-url="${displayUrl}" style="color: #007bff !important; text-decoration: none !important; font-weight: 500 !important; cursor: pointer !important;">${displayName}</a>
                    </div>
                    <div style="color: #6c757d !important; font-size: 12px !important;">Click to view full size</div>
                  </div>
                </div>
              </div>
            `;
          }
          }
          
          inputHtml = `
            ${currentImagesNewHtml}
            <div style="display: flex !important; align-items: center !important; gap: 10px !important; padding: 12px !important; background: #f8f9fa !important; border: 2px dashed #dee2e6 !important; border-radius: 8px !important;">
              <label for="${field.name}-input" style="background: #007bff !important; color: white !important; padding: 8px 16px !important; border-radius: 6px !important; border: none !important; cursor: pointer !important; display: flex !important; align-items: center !important; font-size: 14px !important;">
                <span style="font-size: 16px !important; margin-right: 5px !important;">📎</span>
                Choose ${isMultiple ? 'Files' : 'File'}
              </label>
              <input type="file" id="${field.name}-input" style="display: none !important;" data-target="${field.name}" accept="image/*" ${isMultiple ? 'multiple' : ''}>
              <input type="hidden" id="${field.name}" name="${field.name}" value="${value || ''}">
              <div id="${field.name}-status" style="flex: 1 !important; display: flex !important; align-items: center !important; gap: 8px !important; color: #6c757d !important; font-size: 14px !important;"></div>
            </div>
          `;
          break;

        default:
          // Handle other field types normally
          switch (inputType) {
            case 'Text':
            case 'text':
              const textSize = field.size ? `size="${field.size}"` : '';
              const textMaxlength = field.maxlength ? `maxlength="${field.maxlength}"` : '';
              inputHtml = `<input type="text" id="${field.name}" name="${field.name}" value="${value}" ${textSize} ${textMaxlength}>`;
              break;
            case 'Password':
            case 'password':
              const passSize = field.size ? `size="${field.size}"` : '';
              const passMaxlength = field.maxlength ? `maxlength="${field.maxlength}"` : '';
              inputHtml = `<input type="password" id="${field.name}" name="${field.name}" value="${value}" ${passSize} ${passMaxlength}>`;
              break;
            case 'Email':
              inputHtml = `<input type="email" id="${field.name}" name="${field.name}" value="${value}">`;
              break;
            case 'Number':
            case 'number':
              const minAttr = field.min !== undefined ? `min="${field.min}"` : '';
              const maxAttr = field.max !== undefined ? `max="${field.max}"` : '';
              const stepAttr = field.step ? `step="${field.step}"` : '';
              inputHtml = `<input type="number" id="${field.name}" name="${field.name}" value="${value}" ${minAttr} ${maxAttr} ${stepAttr}>`;
              break;
            case 'Date':
            case 'date':
              const dateMinAttr = field.min ? `min="${field.min}"` : '';
              const dateMaxAttr = field.max ? `max="${field.max}"` : '';
              inputHtml = `<input type="date" id="${field.name}" name="${field.name}" value="${value}" ${dateMinAttr} ${dateMaxAttr}>`;
              break;
            case 'Select':
              const options = (field.options || []).map(opt => 
                `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`
              ).join('');
              inputHtml = `<select id="${field.name}" name="${field.name}">${options}</select>`;
              break;
            case 'Textarea':
            case 'textarea':
              const rows = field.rows || 4;
              const cols = field.cols || 50;
              inputHtml = `<textarea id="${field.name}" name="${field.name}" rows="${rows}" cols="${cols}">${value || ''}</textarea>`;
              break;
            default:
              inputHtml = `<input type="text" id="${field.name}" name="${field.name}" value="${value}">`;
          }
      }

      return `
        <div class="form-group">
          <label for="${field.name}">${field.label || field.name}</label>
          ${inputHtml}
        </div>
      `;
    });
    
    const resolvedFields = await Promise.all(fieldPromises);
    return resolvedFields.join('');
  }

  async generateFormFieldsHTML(formFields, item = {}) {
    // Pre-fetch display domain for all template usage
    const displayDomain = await this.getDisplayDomain();
    
    // Filter and sort fields by order_sequence
    let fieldsToProcess = formFields.fields.filter(field => {
      // Skip fields based on visibility rules
      if (field.active === 'No') return false;
      if (field.advanced_user_level_flag === 'Yes') return false;
      return true;
    });

    // Sort by order_sequence
    fieldsToProcess.sort((a, b) => {
      const orderA = parseFloat(a.order_sequence) || 0;
      const orderB = parseFloat(b.order_sequence) || 0;
      return orderA - orderB;
    });
    
    const fieldPromises = fieldsToProcess.map(async field => {
      // Debug field properties
      console.log(`🔧 Processing field: ${field.name}, type: ${field.input_type || field.type}, lov_json: ${field.lov_json ? 'YES' : 'NO'}`);
      if (field.lov_json) {
        console.log(`📋 Field ${field.name} lov_json content:`, field.lov_json);
      }
      
      // Prioritize existing item value, then default value, then empty string.
      let value = item[field.name] || field.default_value || '';
      let inputHtml = '';
      let inputType = field.input_type || field.type || 'text'; // Normalize the input type.

      // Handle hidden fields
      if (field.hidden_flag === 'Yes') {
        inputType = 'hidden';
      }

      // Handle password fields
      if (inputType.toLowerCase() === 'password') {
        inputType = 'password';
      }

      // Handle special default values.
      if (value === 'Now()' && (inputType === 'Date' || inputType === 'date')) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        value = `${year}-${month}-${day}`;
      }

      // Check if the form is in "edit" mode (i.e., the item has an ID).
      // This is a proxy for knowing if we are editing an existing item.
      const isEditMode = item && item[formFields.id_field];

      // Build common attributes
      const commonAttrs = [];
      
      // Required attribute
      if (field.required_flag === 'Yes' || field.required === true) {
        commonAttrs.push('required');
      }
      
      // Readonly attribute if update is not allowed in edit mode
      if (isEditMode && field.update_allow_flag === 'No') {
        commonAttrs.push('readonly');
      }

      // Input length (maxlength)
      if (field.input_length) {
        commonAttrs.push(`maxlength="${field.input_length}"`);
      }

      // Display width (size attribute for text inputs)
      let sizeAttr = '';
      if (field.display_length) {
        sizeAttr = `size="${field.display_length}"`;
      }

      // Min/Max for numbers
      let minAttr = '';
      let maxAttr = '';
      if (field.value_minimum_number) {
        minAttr = `min="${field.value_minimum_number}"`;
      }
      if (field.value_maximum_number) {
        maxAttr = `max="${field.value_maximum_number}"`;
      }

      // Min/Max for dates
      let dateMinAttr = '';
      let dateMaxAttr = '';
      if (field.value_minimum_date) {
        dateMinAttr = `min="${field.value_minimum_date}"`;
      }
      if (field.value_maximum_date) {
        dateMaxAttr = `max="${field.value_maximum_date}"`;
      }

      const commonAttrString = commonAttrs.join(' ');

      // Handle static dropdowns first as they override other types.
      if (field.lov_static) {
        console.log(`🔍 Processing lov_static field ${field.name}, value: "${value}", lov_static:`, field.lov_static);
        // Parse lov_static and add selected attribute for edit mode
        let staticOptions = field.lov_static;
        if (value && value.trim() !== '') {
          // Escape special regex characters in the value
          const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          console.log(`  Original value: "${value}"`);
          console.log(`  Escaped value: "${escapedValue}"`);
          console.log(`  Original staticOptions: "${staticOptions}"`);
          console.log(`  Testing regex pattern: (<option[^>]*>)${escapedValue}(</option>) with gi flag`);
          // Remove any existing selected attributes first
          staticOptions = staticOptions.replace(/\s+selected/gi, '');
          console.log(`  After removing selected: "${staticOptions}"`);
          
          // For options without value attributes, match the option text content exactly (case-insensitive for tag names)
          const textMatchRegex = new RegExp(`(<option[^>]*>)${escapedValue}(</option>)`, 'gi');
          if (textMatchRegex.test(staticOptions)) {
            console.log(`  Found exact text match for "${escapedValue}"`);
            staticOptions = staticOptions.replace(
              new RegExp(`(<option)([^>]*>)${escapedValue}(</option>)`, 'gi'),
              `$1 selected$2${escapedValue}$3`
            );
          } else {
            // Add selected attribute to matching option (handle both quoted and unquoted values, case-insensitive)
            staticOptions = staticOptions.replace(
              new RegExp(`(<option[^>]*value=["']?${escapedValue}["']?[^>]*)`, 'gi'),
              '$1 selected'
            );
          }
          console.log(`  Final staticOptions:`, staticOptions);
        } else {
          console.log(`  No value to select, using original staticOptions`);
        }
        inputHtml = `<select id="${field.name}" name="${field.name}" ${commonAttrString}>${staticOptions}</select>`;
      } else if (field.lov_dynamic) {
        // Handle dynamic list of values from JSON file
        try {
          const lovFile = await this.r2.get(field.lov_dynamic);
          if (lovFile) {
            const lovData = await lovFile.json();
            const items = lovData.menus || lovData.items || lovData;
            const optionsHtml = items.map(item => {
              const optionValue = field.lov_value_field ? item[field.lov_value_field] : item;
              const optionDisplay = field.lov_display_field ? item[field.lov_display_field] : item;
              const isSelected = optionValue == value;
              return `<option value="${optionValue}" ${isSelected ? 'selected' : ''}>${optionDisplay}</option>`;
            }).join('');
            inputHtml = `<select id="${field.name}" name="${field.name}" ${commonAttrString}><option value="">-- Select --</option>${optionsHtml}</select>`;
          } else {
            inputHtml = `<select id="${field.name}" name="${field.name}" ${commonAttrString}><option value="">File not found: ${field.lov_dynamic}</option></select>`;
          }
        } catch (error) {
          console.error('Error loading dynamic LOV:', error);
          inputHtml = `<select id="${field.name}" name="${field.name}" ${commonAttrString}><option value="">Error loading options</option></select>`;
        }
      } else if (field.lov_json) {
        // Handle lov_json with LOVsystem queries
        console.log(`🔍 Found lov_json field: ${field.name}, lov_json:`, field.lov_json);
        try {
          inputHtml = await this.processLovJson(field.lov_json, field.name, value, commonAttrString);
          console.log(`✅ Generated lov_json HTML for ${field.name}:`, inputHtml.substring(0, 100) + '...');
        } catch (error) {
          console.error('Error processing lov_json:', error);
          inputHtml = `<select id="${field.name}" name="${field.name}" ${commonAttrString}><option value="">Error loading lov_json options</option></select>`;
        }
      } else if (field.type === 'dropdown' && Array.isArray(field.options)) {
        console.log(`🔍 Processing dropdown field ${field.name}, value: "${value}", options:`, field.options);
        const optionsHtml = field.options.map(option => {
          const isSelected = option === value;
          console.log(`  Option: "${option}", isSelected: ${isSelected} (value === option: ${value === option})`);
          return `<option value="${option}" ${isSelected ? 'selected' : ''}>${option}</option>`;
        }).join('');
        inputHtml = `<select id="${field.name}" name="${field.name}" ${commonAttrString}><option value="">-- Select --</option>${optionsHtml}</select>`;
      } else {
        // Main switch for all other input types.
        console.log(`🔍 Processing field "${field.name}" with inputType: "${inputType}"`);
        switch (inputType) {
          case 'hidden':
            inputHtml = `<input type="hidden" id="${field.name}" name="${field.name}" value="${value}">`;
            break;
          case 'OLE':
          case 'OLE_MULTIPLE':
          case 'ole':
          case 'ole_multiple':
          case 'Image':
          case 'image':
            console.log(`✅ OLE case matched for field "${field.name}" with inputType: "${inputType}"`);
            // Modern OLE implementation with background upload and thumbnails
            const isMultipleMain = inputType === 'OLE_MULTIPLE' || inputType === 'ole_multiple';
            let currentImagesMainHtml = '';
            
            if (value && value.trim()) {
              const displayDomain = await this.getDisplayDomain();
              const r2PublicUrl = await this.getR2PublicUrl();
              
              if (isMultipleMain) {
                // Handle multiple images
                let images = [];
                try {
                  if (value.startsWith('[')) {
                    images = JSON.parse(value);
                  } else if (value.includes(',')) {
                    images = value.split(',').map(s => s.trim()).filter(Boolean);
                  } else {
                    images = [value];
                  }
                } catch (e) {
                  images = [value];
                }
                
                if (images.length > 0) {
                  const imageGridHtml = images.map((filename, index) => {
                    const displayUrl = filename.startsWith('http') ? filename : `https://${displayDomain}/${filename}`;
                    const displayName = filename.startsWith('http') ? filename.split('/').pop() : filename;
                    
                    return `
                      <div id="${field.name}-img-${index}" data-filename="${displayName}" style="position: relative !important; display: inline-block !important; margin: 5px !important;">
                        <img src="${displayUrl}" alt="Image ${index + 1}" class="ole-preview-img" data-field="${field.name}" data-index="${index}" style="width: 80px !important; height: 80px !important; object-fit: cover !important; border-radius: 8px !important; border: 2px solid #fff !important; box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; cursor: pointer !important;" title="Click to preview">
                        <div class="ole-delete-btn" data-field="${field.name}" data-index="${index}" style="position: absolute !important; top: -5px !important; right: -5px !important; background: #dc3545 !important; color: white !important; border-radius: 50% !important; width: 20px !important; height: 20px !important; font-size: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important;" title="Remove">×</div>
                      </div>
                    `;
                  }).join('');
                  
                  currentImagesMainHtml = `
                    <div id="${field.name}-images-container" style="margin-bottom: 15px !important; padding: 15px !important; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%) !important; border-radius: 10px !important; border: 2px dashed #007bff !important;">
                      <div style="display: flex !important; align-items: center !important; justify-content: space-between !important; margin-bottom: 10px !important;">
                        <div style="display: flex !important; align-items: center !important;">
                          <span style="font-size: 18px !important; margin-right: 8px !important; color: #007bff !important;">🖼️</span>
                          <span style="font-weight: 600 !important; color: #333 !important;">Current Images (<span id="${field.name}-image-count">${images.length}</span>)</span>
                        </div>
                        <button type="button" class="ole-clear-all-btn" data-field="${field.name}" style="background: #dc3545 !important; color: white !important; border: none !important; border-radius: 4px !important; padding: 4px 8px !important; cursor: pointer !important; font-size: 12px !important;" title="Remove all images">Clear All</button>
                      </div>
                      <div id="${field.name}-image-grid" style="display: flex !important; flex-wrap: wrap !important; gap: 5px !important;">
                        ${imageGridHtml}
                      </div>
                    </div>
                  `;
                }
              } else {
                // Handle single image
                const displayUrl = value.startsWith('http') ? value : `https://${displayDomain}/${value}`;
                const displayName = value.startsWith('http') ? value.split('/').pop() : value;
                
                currentImagesMainHtml = `
                  <div style="margin-bottom: 15px !important; padding: 15px !important; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%) !important; border-radius: 10px !important; border: 2px dashed #007bff !important;">
                    <div style="display: flex !important; align-items: center !important; margin-bottom: 10px !important;">
                      <span style="font-size: 18px !important; margin-right: 8px !important; color: #007bff !important;">🖼️</span>
                      <span style="font-weight: 600 !important; color: #333 !important;">Current Image</span>
                      <button type="button" class="ole-clear-single-btn" data-field="${field.name}" style="margin-left: auto !important; background: #dc3545 !important; color: white !important; border: none !important; border-radius: 50% !important; width: 24px !important; height: 24px !important; cursor: pointer !important; font-size: 14px !important;" title="Remove image">×</button>
                    </div>
                    <div style="display: flex !important; gap: 15px !important; align-items: center !important;">
                      <div class="ole-preview-single" data-field="${field.name}" data-url="${displayUrl}" style="flex-shrink: 0 !important; cursor: pointer !important;">
                        <img src="${displayUrl}" alt="Preview" style="width: 80px !important; height: 80px !important; object-fit: cover !important; border-radius: 8px !important; border: 2px solid #fff !important; box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; display: block !important; background: #f0f0f0 !important; cursor: pointer !important;" title="Click to preview">
                      </div>
                      <div style="flex: 1 !important;">
                        <div style="display: flex !important; align-items: center !important; margin-bottom: 5px !important;">
                          <span style="font-size: 16px !important; margin-right: 6px !important; color: #007bff !important;">📁</span>
                          <a href="javascript:void(0)" class="ole-preview-link" data-field="${field.name}" data-url="${displayUrl}" style="color: #007bff !important; text-decoration: none !important; font-weight: 500 !important; cursor: pointer !important;">${displayName}</a>
                        </div>
                        <div style="color: #6c757d !important; font-size: 12px !important;">Click to view full size</div>
                      </div>
                    </div>
                  </div>
                `;
              }
            }
            
            inputHtml = `
              ${currentImagesMainHtml}
              <div style="display: flex !important; align-items: center !important; gap: 10px !important; padding: 12px !important; background: #f8f9fa !important; border: 2px dashed #dee2e6 !important; border-radius: 8px !important;">
                <label for="${field.name}-input" style="background: #007bff !important; color: white !important; padding: 8px 16px !important; border-radius: 6px !important; border: none !important; cursor: pointer !important; display: flex !important; align-items: center !important; font-size: 14px !important;">
                  <span style="font-size: 16px !important; margin-right: 5px !important;">📎</span>
                  Choose ${isMultipleMain ? 'Files' : 'File'}
                </label>
                <input type="file" id="${field.name}-input" style="display: none !important;" data-target="${field.name}" accept="image/*" ${isMultipleMain ? 'multiple' : ''}>
                <input type="hidden" id="${field.name}" name="${field.name}" value="${value || ''}">
                <div id="${field.name}-status" style="flex: 1 !important; display: flex !important; align-items: center !important; gap: 8px !important; color: #6c757d !important; font-size: 14px !important;"></div>
              </div>
            `;
            break;
          case 'password':
            inputHtml = `<input type="password" id="${field.name}" name="${field.name}" value="${value}" ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'Checkbox':
            const isChecked = value === 'Yes' || value === true || value === 'true';
            inputHtml = `<input type="checkbox" id="${field.name}" name="${field.name}" value="Yes" ${isChecked ? 'checked' : ''} ${commonAttrString}>`;
            break;
          case 'ColorPicker':
            inputHtml = `<input type="color" id="${field.name}" name="${field.name}" value="${value}" ${commonAttrString}>`;
            break;
          case 'Date':
          case 'date':
            inputHtml = `<input type="date" id="${field.name}" name="${field.name}" value="${value}" ${dateMinAttr} ${dateMaxAttr} ${commonAttrString}>`;
            break;
          case 'Decimal':
            inputHtml = `<input type="number" id="${field.name}" name="${field.name}" value="${value}" step="any" ${minAttr || 'min="0"'} ${maxAttr} ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'DecimalNegative':
            inputHtml = `<input type="number" id="${field.name}" name="${field.name}" value="${value}" step="any" ${minAttr} ${maxAttr} ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'Number':
          case 'RandomNumber':
            inputHtml = `<input type="number" id="${field.name}" name="${field.name}" value="${value}" ${minAttr} ${maxAttr} ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'Disabled':
            inputHtml = `<input type="text" id="${field.name}" name="${field.name}" value="${value}" disabled ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'Display':
          case 'ReadOnly':
            inputHtml = `<input type="text" id="${field.name}" name="${field.name}" value="${value}" readonly ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'DropDownEditable':
            const optionsList = (field.options || []).map(opt => `<option value="${opt}"></option>`).join('');
            inputHtml = `<input list="${field.name}-datalist" id="${field.name}" name="${field.name}" value="${value}" ${sizeAttr} ${commonAttrString}>
                               <datalist id="${field.name}-datalist">${optionsList}</datalist>`;
            break;
          case 'Email':
            inputHtml = `<input type="email" id="${field.name}" name="${field.name}" value="${value}" ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'EmailMultiple':
            inputHtml = `<input type="email" id="${field.name}" name="${field.name}" value="${value}" multiple ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'Filename':
            inputHtml = `<input type="text" id="${field.name}" name="${field.name}" value="${value}" pattern="^[a-zA-Z0-9_.-]+$" ${sizeAttr} ${commonAttrString}>`;
            break;
          case 'Memo':
          case 'textarea':
            const textareaRows = field.rows || 5;
            const textareaCols = field.display_length || field.cols || 50;
            inputHtml = `<textarea id="${field.name}" name="${field.name}" rows="${textareaRows}" cols="${textareaCols}" ${commonAttrString}>${value || ''}</textarea>`;
            break;


          case 'SelectMultiple':
            const multiOptions = (field.options || []).map(opt => {
              const isSelected = Array.isArray(value) && value.includes(opt);
              return `<option value="${opt}" ${isSelected ? 'selected' : ''}>${opt}</option>`;
            }).join('');
            inputHtml = `<select id="${field.name}" name="${field.name}" multiple>${multiOptions}</select>`;
            break;
          case 'Website':
            inputHtml = `<input type="url" id="${field.name}" name="${field.name}" value="${value}">`;
            break;
          case 'Text':
          case 'text':
            inputHtml = `<input type="text" id="${field.name}" name="${field.name}" value="${value}" ${sizeAttr} ${commonAttrString}>`;
            break;

          default:
            console.log(`⚠️ Default case reached for field "${field.name}" with inputType: "${inputType}"`);
            inputHtml = `<input type="text" id="${field.name}" name="${field.name}" value="${value}" ${sizeAttr} ${commonAttrString}>`;
            break;
        }
      }

      // Handle help_tip with light bulb icon and mouseover tooltip
      let helpTipHtml = '';
      if (field.help_tip && field.help_tip.trim()) {
        const helpId = `help-${field.name}-${Date.now()}`;
        helpTipHtml = `
          <span class="help-tip tooltip-trigger" 
                style="margin-left: 8px; cursor: help; position: relative; display: inline-block;" 
                onmouseover="showTooltip('${helpId}')" 
                onmouseout="hideTooltip('${helpId}')"
                data-help-id="${helpId}">💡
            <div id="${helpId}" class="tooltip-content" style="
              display: none;
              position: absolute;
              background: #333;
              color: white;
              padding: 8px 12px;
              border-radius: 4px;
              font-size: 12px;
              white-space: normal;
              z-index: 10000;
              top: -40px;
              left: -75px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              min-width: 150px;
              max-width: 250px;
              text-align: center;
              word-wrap: break-word;
            ">${field.help_tip.replace(/"/g, '&quot;')}</div>
          </span>`;
      }

      // Skip rendering for hidden fields
      if (inputType === 'hidden') {
        return inputHtml;
      }

      return `
        <div class="form-group">
          <label for="${field.name}">${field.label || field.name}</label>
          <div style="display: flex; align-items: center;">
            ${inputHtml}${helpTipHtml}
          </div>
        </div>
      `;
    });
    
    const resolvedFields = await Promise.all(fieldPromises);
    return resolvedFields.join('');
  }

  async renderPageModern(body, title) {
    const timestamp = Date.now();
    const displayDomain = await this.getDisplayDomain();
    console.log('🔧 renderPageModern: displayDomain =', displayDomain);
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - MODERN</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f0f2f5; }
          .container { background: white; padding: 24px; border-radius: 8px; max-width: 1200px; margin: 0 auto; }
          .current-image-modern { 
            margin-bottom: 15px; 
            padding: 15px; 
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); 
            border-radius: 10px; 
            border: 2px dashed #007bff; 
          }
          .image-header-modern { display: flex; align-items: center; margin-bottom: 10px; }
          .image-content-modern { display: flex; gap: 15px; align-items: center; }
          .thumbnail-modern { 
            width: 80px; height: 80px; object-fit: cover; border-radius: 8px; 
            border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
          }
          .file-info-modern { flex: 1; }
          .remove-btn-modern { 
            margin-left: auto; background: #dc3545; color: white; border: none; 
            border-radius: 50%; width: 24px; height: 24px; cursor: pointer; 
          }
          .upload-area-modern { 
            display: flex; align-items: center; gap: 10px; padding: 12px; 
            background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px; 
          }
          .choose-btn-modern { 
            background: #007bff; color: white; padding: 8px 16px; 
            border-radius: 6px; border: none; cursor: pointer; 
          }
          form { margin-top: 24px; }
          .form-group { margin-bottom: 16px; }
          label { display: block; margin-bottom: 8px; font-weight: 500; }
          input, select, textarea { width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 4px; box-sizing: border-box; }
          button[type="submit"] { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
          /* Image Modal Styles */
          .image-modal { 
            display: none; position: fixed; z-index: 1000; left: 0; top: 0; 
            width: 100%; height: 100%; background-color: rgba(0,0,0,0.8); 
          }
          .image-modal-content { 
            position: relative; margin: 2% auto; padding: 0; 
            width: 90%; max-width: 800px; max-height: 90vh; 
            background-color: #fff; border-radius: 8px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.3); 
          }
          .image-modal-header { 
            display: flex; justify-content: space-between; align-items: center; 
            padding: 15px 20px; border-bottom: 1px solid #eee; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; border-radius: 8px 8px 0 0; 
          }
          .image-modal-title { font-size: 18px; font-weight: 600; }
          .image-modal-close { 
            background: rgba(255,255,255,0.2); color: white; border: none; 
            width: 32px; height: 32px; border-radius: 50%; cursor: pointer; 
            font-size: 18px; display: flex; align-items: center; justify-content: center; 
          }
          .image-modal-close:hover { background: rgba(255,255,255,0.3); }
          .image-modal-body { 
            padding: 20px; text-align: center; position: relative; 
            max-height: calc(90vh - 120px); overflow: auto; 
          }
          .modal-image { 
            max-width: 100%; max-height: 70vh; object-fit: contain; 
            border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .image-slider { position: relative; }
          .slider-nav { 
            position: absolute; top: 50%; transform: translateY(-50%); 
            background: rgba(0,0,0,0.5); color: white; border: none; 
            width: 40px; height: 40px; border-radius: 50%; cursor: pointer; 
            font-size: 18px; z-index: 10; 
          }
          .slider-nav:hover { background: rgba(0,0,0,0.7); }
          .slider-prev { left: 10px; }
          .slider-next { right: 10px; }
          .slider-indicator { 
            display: flex; justify-content: center; gap: 8px; 
            margin-top: 15px; 
          }
          .slider-dot { 
            width: 10px; height: 10px; border-radius: 50%; 
            background: #ccc; cursor: pointer; 
          }
          .slider-dot.active { background: #007bff; }
          .modal-actions { 
            display: flex; justify-content: center; gap: 10px; 
            margin-top: 15px; padding-top: 15px; 
            border-top: 1px solid #eee; 
          }
          .modal-delete-btn { 
            background: #dc3545; color: white; border: none; 
            padding: 8px 16px; border-radius: 4px; cursor: pointer; 
            display: flex; align-items: center; gap: 5px; 
          }
          .modal-delete-btn:hover { background: #c82333; }
        </style>
      </head>
      <body>
        <div class="container">
          ${body}
        </div>
        
        <!-- Image Modal -->
        <div id="imageModal" class="image-modal">
          <div class="image-modal-content">
            <div class="image-modal-header">
              <div class="image-modal-title">Image Preview</div>
              <button class="image-modal-close" onclick="closeImageModal()">×</button>
            </div>
            <div class="image-modal-body">
              <div class="image-slider">
                <img id="modalImage" class="modal-image" src="" alt="Preview">
                <button class="slider-nav slider-prev" onclick="previousImage()" style="display: none;">‹</button>
                <button class="slider-nav slider-next" onclick="nextImage()" style="display: none;">›</button>
              </div>
              <div class="slider-indicator" id="sliderIndicator"></div>
              <div class="modal-actions">
                <button class="modal-delete-btn" onclick="deleteCurrentImage()">
                  <span>🗑️</span> Delete Image
                </button>
              </div>
            </div>
          </div>
        </div>
        <script>
          console.log('🚀 Script started loading...');
          // Define CLIENT_DOMAIN globally for all scripts
          window.CLIENT_DOMAIN = '` + displayDomain + `';
          const CLIENT_DOMAIN = window.CLIENT_DOMAIN;
          console.log('🔧 CLIENT_DOMAIN set to:', CLIENT_DOMAIN);
          window.openImageModalFromField = function(fieldName, index) {
            console.log('🖼️ openImageModalFromField called:', fieldName, index);
            try {
              const hiddenInput = document.getElementById(fieldName);
              if (!hiddenInput) {
                console.error('❌ Hidden input not found:', fieldName);
                return;
              }
              const images = window._safeParseImages(hiddenInput.value);
              console.log('🖼️ Parsed images:', images);
              if (!Array.isArray(images) || images.length === 0) return;
              const allImages = images.map(f => ({
                url: f.startsWith('http') ? f : 'https://` + displayDomain + `/' + f,
                filename: f.startsWith('http') ? f.split('/').pop() : f
              }));
              const startUrl = allImages[index]?.url || allImages[0].url;
              openImageModal(startUrl, fieldName, allImages);
            } catch (e) {
              console.error('Failed to open modal from field', fieldName, e);
            }
          };
          window._safeParseImages = function(raw) {
            try {
              if (!raw) return [];
              const trimmed = String(raw).replace(/&quot;/g, '"').trim();
              if (!trimmed) return [];
              if (trimmed.startsWith('[')) {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed : [];
              }
              if (trimmed.includes(',')) {
                return trimmed.split(',').map(s => s.trim()).filter(Boolean);
              }
              return [trimmed];
            } catch (e) {
              try {
                // Last attempt: if it's not valid JSON, treat as single filename
                const fallback = String(raw).trim();
                return fallback ? [fallback] : [];
              } catch (_) {
                return [];
              }
            }
          };

          window.removeImageFromGrid = function(fieldName, identifier) {
            console.log('🗑️ removeImageFromGrid called:', fieldName, identifier);
            const hiddenInput = document.getElementById(fieldName);
            const statusElement = document.getElementById(fieldName + '-status');
            
            if (!hiddenInput) {
              console.error('Hidden input not found for field:', fieldName);
              return;
            }
            
            try {
              let images = window._safeParseImages(hiddenInput.value);
              if (!Array.isArray(images)) images = [];

              // Support both index and filename identifier
              let removed = false;
              if (typeof identifier === 'number') {
                if (identifier >= 0 && identifier < images.length) {
                  images.splice(identifier, 1);
                  removed = true;
                }
              } else if (typeof identifier === 'string' && identifier) {
                const idx = images.findIndex(f => String(f) === identifier || String(f).split('/').pop() === identifier);
                if (idx !== -1) {
                  images.splice(idx, 1);
                  removed = true;
                }
              }

              if (removed) {
                // Delete from R2 bucket
                const fileToDelete = typeof identifier === 'number' ? 
                  images[identifier] : 
                  images.find(f => String(f) === identifier || String(f).split('/').pop() === identifier);
                
                if (fileToDelete && !fileToDelete.startsWith('http')) {
                  fetch('/api/delete-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: fileToDelete })
                  }).then(response => response.json())
                    .then(result => {
                      if (result.success) {
                        console.log('✅ File deleted from R2:', fileToDelete);
                      } else {
                        console.warn('⚠️ Failed to delete from R2:', result.error);
                      }
                    })
                    .catch(error => console.error('❌ Delete error:', error));
                }
                
                hiddenInput.value = JSON.stringify(images);
                
                if (statusElement) {
                  statusElement.innerHTML = '<span style="color: #28a745; font-size: 16px;">🗑️</span> Image removed';
                  statusElement.className = 'upload-status-multi success';
                }
                
                // Update DOM instantly without reload
                const grid = document.getElementById(fieldName + '-image-grid');
                const counter = document.getElementById(fieldName + '-image-count');
                const container = document.getElementById(fieldName + '-images-container');
                
                // Update counter
                if (counter) counter.textContent = images.length;
                
                // If no images left, hide the container
                if (images.length === 0) {
                  if (container) {
                    container.style.display = 'none';
                  }
                } else {
                  // Show container and update grid
                  if (container) {
                    container.style.display = 'block';
                  }
                  
                  if (grid) {
                    grid.innerHTML = images.map((filename, index) => {
                      const displayUrl = filename.startsWith('http') ? filename : 'https://' + window.CLIENT_DOMAIN + '/' + filename;
                      const displayName = filename.startsWith('http') ? filename.split('/').pop() : filename;
                      const safeName = displayName.replace(/'/g, "\\'");
                      const imgHtml = '<div id="' + fieldName + '-img-' + index + '" data-filename="' + displayName + '" style="position: relative !important; display: inline-block !important; margin: 5px !important;">' +
                        '<img src="' + displayUrl + '" alt="Image ' + (index + 1) + '" class="ole-preview-img" data-field="' + fieldName + '" data-index="' + index + '" style="width: 80px !important; height: 80px !important; object-fit: cover !important; border-radius: 8px !important; border: 2px solid #fff !important; box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; cursor: pointer !important;" title="Click to preview">' +
                        '<div class="ole-delete-btn" data-field="' + fieldName + '" data-index="' + index + '" style="position: absolute !important; top: -5px !important; right: -5px !important; background: #dc3545 !important; color: white !important; border-radius: 50% !important; width: 20px !important; height: 20px !important; font-size: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important;" title="Remove">×</div>' +
                      '</div>';
                      console.log('🔧 Generated image HTML:', imgHtml);
                      return imgHtml;
                    }).join('');
                  }
                }
              } else {
                console.error('Invalid image index or images array');
              }
            } catch (e) {
              console.error('Error removing image:', e);
              if (statusElement) {
                statusElement.innerHTML = '<span style="color: #dc3545; font-size: 16px;">❌</span> Error removing image';
                statusElement.className = 'upload-status-multi error';
              }
            }
          };
          
          window.clearAllImages = function(fieldName) {
            console.log('🗑️ Clearing all images:', fieldName);
            if (confirm('Are you sure you want to remove all images?')) {
              const hiddenInput = document.getElementById(fieldName);
              const statusElement = document.getElementById(fieldName + '-status');
              
              if (!hiddenInput) {
                console.error('Hidden input not found for field:', fieldName);
                return;
              }
              
              // Delete all files from R2 bucket
              const currentImages = window._safeParseImages(hiddenInput.value);
              currentImages.forEach(filename => {
                if (filename && !filename.startsWith('http')) {
                  fetch('/api/delete-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: filename })
                  }).then(response => response.json())
                    .then(result => {
                      if (result.success) {
                        console.log('✅ File deleted from R2:', filename);
                      } else {
                        console.warn('⚠️ Failed to delete from R2:', result.error);
                      }
                    })
                    .catch(error => console.error('❌ Delete error:', error));
                }
              });
              
              hiddenInput.value = '[]';
              
              if (statusElement) {
                statusElement.innerHTML = '<span style="color: #28a745; font-size: 16px;">🗑️</span> All images removed';
                statusElement.className = 'upload-status-multi success';
              }
              
              // Update DOM instantly without page reload
              const grid = document.getElementById(fieldName + '-image-grid');
              const counter = document.getElementById(fieldName + '-image-count');
              const container = document.getElementById(fieldName + '-images-container');
              
              // Clear the grid
              if (grid) {
                grid.innerHTML = '';
              }
              
              // Update counter
              if (counter) {
                counter.textContent = '0';
              }
              
              // Hide the container since no images remain
              if (container) {
                container.style.display = 'none';
              }
            }
          };
          
          window.previewImage = function(url) {
            window.open(url, '_blank');
          };
          
          window.clearImage = function(fieldName) {
            const hiddenInput = document.getElementById(fieldName);
            const statusElement = document.getElementById(fieldName + '-status');
            const currentImageDiv = document.querySelector(\`#\${fieldName}\`).closest('div').querySelector('div[style*="linear-gradient"]');
            
            // Delete from R2 bucket if it's not an external URL
            const currentValue = hiddenInput.value;
            if (currentValue && !currentValue.startsWith('http')) {
              fetch('/api/delete-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: currentValue })
              }).then(response => response.json())
                .then(result => {
                  if (result.success) {
                    console.log('✅ File deleted from R2:', currentValue);
                  } else {
                    console.warn('⚠️ Failed to delete from R2:', result.error);
                  }
                })
                .catch(error => console.error('❌ Delete error:', error));
            }
            
            hiddenInput.value = '';
            statusElement.innerHTML = '<span style="color: #28a745; font-size: 16px;">🗑️</span> Image removed';
            statusElement.className = 'upload-status success';
            if (currentImageDiv) {
              currentImageDiv.style.animation = 'fadeOut 0.3s ease';
              setTimeout(() => currentImageDiv.remove(), 300);
            }
          };

          // Modern OLE Upload Functionality
          document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 Modern OLE upload system initialized');
            
            // Handle file input changes for all OLE fields
            document.querySelectorAll('input[type="file"][data-target]').forEach(fileInput => {
              fileInput.addEventListener('change', async function(e) {
                const fieldName = this.getAttribute('data-target');
                const files = Array.from(e.target.files);
                const isMultiple = this.hasAttribute('multiple');
                
                if (files.length === 0) return;
                
                console.log(\`📁 Files selected for \${fieldName}:\`, files.map(f => f.name));
                
                const statusElement = document.getElementById(fieldName + '-status');
                const hiddenInput = document.getElementById(fieldName);
                
                if (!isMultiple && files.length > 1) {
                  if (statusElement) {
                    statusElement.innerHTML = '<span style="color: #dc3545;">❌</span> Only one file allowed';
                  }
                  return;
                }
                
                // Show uploading status
                if (statusElement) {
                  statusElement.innerHTML = '<span style="color: #007bff;">⏳</span> Uploading...';
                }
                
                try {
                  const uploadedFiles = [];
                  
                  for (const file of files) {
                    console.log(\`⬆️ Uploading: \${file.name}\`);
                    
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    const response = await fetch('/api/upload-file', {
                      method: 'POST',
                      body: formData
                    });
                    
                    if (!response.ok) {
                      throw new Error(\`Upload failed: \${response.statusText}\`);
                    }
                    
                    const result = await response.json();
                    if (result.success) {
                      uploadedFiles.push(result.objectKey);
                      console.log(\`✅ Uploaded: \${file.name} -> \${result.objectKey}\`);
                    } else {
                      throw new Error(result.error || 'Upload failed');
                    }
                  }
                  
                  // Update hidden input
                  if (isMultiple) {
                    let existingImages = [];
                    try {
                      existingImages = window._safeParseImages(hiddenInput.value);
                    } catch (e) {
                      existingImages = [];
                    }
                    const allImages = [...existingImages, ...uploadedFiles];
                    hiddenInput.value = JSON.stringify(allImages);
                  } else {
                    hiddenInput.value = uploadedFiles[0];
                  }
                  
                  // Show success status
                  if (statusElement) {
                    statusElement.innerHTML = \`<span style="color: #28a745;">✅</span> \${files.length} file(s) uploaded\`;
                  }
                  
                  // Refresh the page to show new images
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                  
                } catch (error) {
                  console.error('❌ Upload error:', error);
                  if (statusElement) {
                    statusElement.innerHTML = \`<span style="color: #dc3545;">❌</span> Upload failed: \${error.message}\`;
                  }
                }
                
                // Clear the file input
                e.target.value = '';
              });
            });
          });

          console.log("🚀 MODERN INTERFACE LOADED - ${timestamp}");
          console.log("📋 Current fields being processed:");
          document.addEventListener('DOMContentLoaded', function() {
            console.log("📊 DOM loaded, checking form fields...");
            document.querySelectorAll('.form-group').forEach((group, index) => {
              console.log(\`Field \${index + 1}:\`, group.querySelector('label')?.textContent);
            });
          });
          
          // Modal system variables
          let currentImages = [];
          let currentImageIndex = 0;
          let currentFieldName = '';
          
          // Image handling functions (moved to global scope below)
          
          // Modal functions
          window.openImageModal = function(imageUrl, fieldName, allImages = null) {
            console.log('🖼️ Opening modal:', imageUrl, fieldName, allImages);
            
            currentFieldName = fieldName;
            
            if (allImages && allImages.length > 1) {
              // Multiple images - setup slider
              currentImages = allImages;
              currentImageIndex = allImages.findIndex(img => img.url === imageUrl);
              if (currentImageIndex === -1) currentImageIndex = 0;
              
              document.querySelector('.slider-prev').style.display = 'block';
              document.querySelector('.slider-next').style.display = 'block';
              setupSliderIndicators();
            } else {
              // Single image
              currentImages = imageUrl ? [{ url: imageUrl, filename: imageUrl.split('/').pop() }] : [];
              currentImageIndex = 0;
              
              document.querySelector('.slider-prev').style.display = 'none';
              document.querySelector('.slider-next').style.display = 'none';
              document.getElementById('sliderIndicator').innerHTML = '';
            }
            
            if (currentImages.length > 0) {
              updateModalImage();
              document.getElementById('imageModal').style.display = 'block';
            }
          }
          
          window.closeImageModal = function() {
            document.getElementById('imageModal').style.display = 'none';
            currentImages = [];
            currentImageIndex = 0;
            currentFieldName = '';
          }
          
          window.updateModalImage = function() {
            if (currentImages.length === 0) return;
            
            const currentImage = currentImages[currentImageIndex];
            document.getElementById('modalImage').src = currentImage.url;
            document.querySelector('.image-modal-title').textContent = 
              'Image ' + (currentImageIndex + 1) + ' of ' + currentImages.length + ' - ' + currentImage.filename;
            
            // Update slider indicators
            document.querySelectorAll('.slider-dot').forEach((dot, index) => {
              dot.classList.toggle('active', index === currentImageIndex);
            });
          }
          
          window.previousImage = function() {
            if (currentImages.length <= 1) return;
            currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
            updateModalImage();
          }
          
          window.nextImage = function() {
            if (currentImages.length <= 1) return;
            currentImageIndex = (currentImageIndex + 1) % currentImages.length;
            updateModalImage();
          }
          
          window.setupSliderIndicators = function() {
            const indicatorContainer = document.getElementById('sliderIndicator');
            indicatorContainer.innerHTML = '';
            
            currentImages.forEach((_, index) => {
              const dot = document.createElement('div');
              dot.className = 'slider-dot';
              if (index === currentImageIndex) dot.classList.add('active');
              dot.onclick = () => {
                currentImageIndex = index;
                updateModalImage();
              };
              indicatorContainer.appendChild(dot);
            });
          }
          
          window.deleteCurrentImage = function() {
            if (currentImages.length === 0) return;
            
            const confirmed = confirm('Are you sure you want to delete "' + currentImages[currentImageIndex].filename + '"?');
            if (!confirmed) return;
            
            console.log('🗑️ Deleting image:', currentImages[currentImageIndex]);
            
            // Remove from current images array
            currentImages.splice(currentImageIndex, 1);
            
            if (currentImages.length === 0) {
              // No images left - clear the field
              const hiddenInput = document.querySelector('input[name="' + currentFieldName + '"]');
              if (hiddenInput) {
                hiddenInput.value = '';
              }
              closeImageModal();
              window.location.reload();
            } else {
              // Adjust index and update
              if (currentImageIndex >= currentImages.length) {
                currentImageIndex = currentImages.length - 1;
              }
              
              // Update the hidden input with remaining images
              const hiddenInput = document.querySelector('input[name="' + currentFieldName + '"]');
              if (hiddenInput) {
                if (currentImages.length === 1) {
                  // Single image - store as string
                  hiddenInput.value = currentImages[0].filename;
                } else {
                  // Multiple images - store as JSON array
                  hiddenInput.value = JSON.stringify(currentImages.map(img => img.filename));
                }
              }
              
              setupSliderIndicators();
              updateModalImage();
              
              // Refresh page to show updated interface
              setTimeout(() => window.location.reload(), 500);
            }
          }
          
          // Close modal when clicking outside
          window.onclick = function(event) {
            const modal = document.getElementById('imageModal');
            if (event.target === modal) {
              closeImageModal();
            }
          };
          
          // Keyboard navigation
          document.addEventListener('keydown', function(e) {
            const modal = document.getElementById('imageModal');
            if (modal.style.display === 'block') {
              if (e.key === 'Escape') closeImageModal();
              else if (e.key === 'ArrowLeft') previousImage();
              else if (e.key === 'ArrowRight') nextImage();
            }
          });
          
          // Helper functions for OLE_MULTIPLE (moved to global scope below)
          
          // Event delegation for OLE image interactions
          console.log('🔧 Setting up click event delegation...');
          
          // Test if clicks work at all
          document.addEventListener('click', function(e) {
            console.log('🖱️ ANY click detected on page:', e.target.tagName, e.target.className);
          });
          
          document.addEventListener('click', function(e) {
            console.log('🖱️ OLE Click detected on:', e.target, 'Classes:', e.target.classList.toString());
            // Handle preview image clicks (multiple images)
            if (e.target.classList.contains('ole-preview-img')) {
              const fieldName = e.target.getAttribute('data-field');
              const index = parseInt(e.target.getAttribute('data-index'));
              console.log('🖼️ Preview clicked via delegation:', fieldName, index);
              window.openImageModalFromField(fieldName, index);
            }
            
            // Handle delete button clicks (multiple images)
            if (e.target.classList.contains('ole-delete-btn')) {
              e.stopPropagation();
              const fieldName = e.target.getAttribute('data-field');
              const index = parseInt(e.target.getAttribute('data-index'));
              console.log('🗑️ Delete clicked via delegation:', fieldName, index);
              window.removeImageFromGrid(fieldName, index);
            }
            
            // Handle clear all button clicks
            if (e.target.classList.contains('ole-clear-all-btn')) {
              const fieldName = e.target.getAttribute('data-field');
              console.log('🗑️ Clear all clicked via delegation:', fieldName);
              window.clearAllImages(fieldName);
            }
            
            // Handle single image clear button clicks
            if (e.target.classList.contains('ole-clear-single-btn')) {
              const fieldName = e.target.getAttribute('data-field');
              console.log('🗑️ Clear single clicked via delegation:', fieldName);
              window.clearImage(fieldName);
            }
            
            // Handle single image preview clicks
            if (e.target.classList.contains('ole-preview-single') || e.target.classList.contains('ole-preview-link')) {
              const fieldName = e.target.getAttribute('data-field');
              const url = e.target.getAttribute('data-url');
              console.log('🖼️ Single preview clicked via delegation:', fieldName, url);
              window.openImageModal(url, fieldName);
            }
            
            // Handle uploaded image preview clicks
            if (e.target.classList.contains('ole-preview-uploaded') || e.target.closest('.ole-preview-uploaded')) {
              const button = e.target.classList.contains('ole-preview-uploaded') ? e.target : e.target.closest('.ole-preview-uploaded');
              const url = button.getAttribute('data-url');
              console.log('🖼️ Uploaded preview clicked via delegation:', url);
              window.previewImage(url);
            }
            
            // Handle uploaded image delete clicks
            if (e.target.classList.contains('ole-delete-uploaded') || e.target.closest('.ole-delete-uploaded')) {
              const button = e.target.classList.contains('ole-delete-uploaded') ? e.target : e.target.closest('.ole-delete-uploaded');
              const target = button.getAttribute('data-target');
              console.log('🗑️ Uploaded delete clicked via delegation:', target);
              window.deleteUploadedImage(target);
            }
            
            // Handle tooltip clicks
            if (e.target.classList.contains('tooltip-trigger')) {
              const helpId = e.target.getAttribute('data-help-id');
              console.log('💡 Tooltip clicked via delegation:', helpId);
              try { 
                window.showTooltip(helpId); 
                setTimeout(() => window.hideTooltip(helpId), 3000); 
              } catch(err) { 
                console.error('Tooltip error:', err); 
              }
            }
          });

          // File upload handling
          document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('input[type="file"]').forEach(input => {
              input.addEventListener('change', async function(e) {
                const file = e.target.files[0];
                if (!file) return;
                
                const formData = new FormData();
                formData.append('file', file);
                
                try {
                  const response = await fetch('/api/upload-file', {
                    method: 'POST',
                    body: formData
                  });
                  
                  const result = await response.json();
                  if (result.success) {
                    // Update hidden input
                    const hiddenInput = document.querySelector('input[name="' + e.target.dataset.target + '"]');
                    if (hiddenInput) {
                      hiddenInput.value = result.objectKey;
                    }
                    alert('Upload successful!');
                    window.location.reload();
                  }
                } catch (error) {
                  alert('Upload failed: ' + error.message);
                }
              });
            });
          });

          window.deleteImageFromR2 = function(key) {
            return fetch('/api/delete-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key })
            })
            .then(response => response.json())
            .then(data => {
              if (!data.success) {
                throw new Error(data.error || 'Failed to delete image');
              }
              return data;
            });
          }

          // Update removeImageFromGrid to delete from R2
          window.removeImageFromGrid = async function(fieldName, index) {
            console.log('🗑️ Removing image:', fieldName, index);
            const hiddenInput = document.getElementById(fieldName);
            const statusElement = document.getElementById(fieldName + '-status');
            
            if (!hiddenInput) {
              console.error('Hidden input not found for field:', fieldName);
              return;
            }
            
            try {
              let images = window._safeParseImages(hiddenInput.value);
              if (!Array.isArray(images)) images = [];
              
              if (index >= 0 && index < images.length) {
                const filename = images[index];
                
                // Delete from R2 first
                statusElement.innerHTML = '<span style="color: #007bff; font-size: 16px;">⟳</span> Deleting image...';
                await deleteImageFromR2(filename);
                
                // Remove from array
                images.splice(index, 1);
                hiddenInput.value = JSON.stringify(images);
                
                statusElement.innerHTML = '<span style="color: #28a745; font-size: 16px;">🗑️</span> Image deleted';
                statusElement.className = 'upload-status-multi success';
                
                // Update DOM
                const grid = document.getElementById(fieldName + '-image-grid');
                const counter = document.getElementById(fieldName + '-image-count');
                const container = document.getElementById(fieldName + '-images-container');
                
                if (counter) counter.textContent = images.length;
                
                if (images.length === 0) {
                  if (container) container.style.display = 'none';
                } else {
                  if (container) container.style.display = 'block';
                  if (grid) {
                    grid.innerHTML = images.map((filename, idx) => {
                      const displayUrl = filename.startsWith('http') ? filename : 'https://' + window.CLIENT_DOMAIN + '/' + filename;
                      const displayName = filename.startsWith('http') ? filename.split('/').pop() : filename;
                      return '<div id="' + fieldName + '-img-' + idx + '" data-filename="' + displayName + '" style="position: relative !important; display: inline-block !important; margin: 5px !important;">' +
                        '<img src="' + displayUrl + '" alt="Image ' + (idx + 1) + '" class="ole-preview-img" data-field="' + fieldName + '" data-index="' + idx + '" style="width: 80px !important; height: 80px !important; object-fit: cover !important; border-radius: 8px !important; border: 2px solid #fff !important; box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; cursor: pointer !important;" title="Click to preview">' +
                        '<div class="ole-delete-btn" data-field="' + fieldName + '" data-index="' + idx + '" style="position: absolute !important; top: -5px !important; right: -5px !important; background: #dc3545 !important; color: white !important; border-radius: 50% !important; width: 20px !important; height: 20px !important; font-size: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important;" title="Remove">×</div>' +
                      '</div>';
                    }).join('');
                  }
                }
              } else {
                console.error('Invalid image index');
              }
            } catch (e) {
              console.error('Error deleting image:', e);
              statusElement.innerHTML = '<span style="color: #dc3545; font-size: 16px;">❌</span> Error deleting image';
              statusElement.className = 'upload-status-multi error';
            }
          };

          // Update clearAllImages to delete all from R2
          window.clearAllImages = async function(fieldName) {
            if (confirm('Are you sure you want to remove all images?')) {
              const hiddenInput = document.getElementById(fieldName);
              const statusElement = document.getElementById(fieldName + '-status');
              
              if (!hiddenInput) {
                console.error('Hidden input not found for field:', fieldName);
                return;
              }
              
              try {
                let images = window._safeParseImages(hiddenInput.value);
                if (!Array.isArray(images)) images = [];
                
                statusElement.innerHTML = '<span style="color: #007bff; font-size: 16px;">⟳</span> Deleting ' + images.length + ' images...';
                
                // Delete all from R2
                await Promise.all(images.map(filename => deleteImageFromR2(filename)));
                
                hiddenInput.value = '[]';
                
                statusElement.innerHTML = '<span style="color: #28a745; font-size: 16px;">🗑️</span> All images deleted';
                statusElement.className = 'upload-status-multi success';
                
                // Update DOM
                const grid = document.getElementById(fieldName + '-image-grid');
                const counter = document.getElementById(fieldName + '-image-count');
                const container = document.getElementById(fieldName + '-images-container');
                
                if (grid) grid.innerHTML = '';
                if (counter) counter.textContent = '0';
                if (container) container.style.display = 'none';
                
              } catch (e) {
                console.error('Error clearing images:', e);
                statusElement.innerHTML = '<span style="color: #dc3545; font-size: 16px;">❌</span> Error deleting images';
                statusElement.className = 'upload-status-multi error';
              }
            }
          };

          // Help tip tooltip functions - Define immediately
          if (typeof window.showTooltip === 'undefined') {
            window.showTooltip = function(tooltipId) {
              console.log('🔍 Showing tooltip:', tooltipId);
              const tooltip = document.getElementById(tooltipId);
              if (tooltip) {
                console.log('✅ Tooltip found, showing:', tooltip);
                tooltip.style.display = 'block';
              } else {
                console.error('❌ Tooltip not found:', tooltipId);
              }
            };
          }

          if (typeof window.hideTooltip === 'undefined') {
            window.hideTooltip = function(tooltipId) {
              console.log('🔍 Hiding tooltip:', tooltipId);
              const tooltip = document.getElementById(tooltipId);
              if (tooltip) {
                tooltip.style.display = 'none';
              }
            };
          }

          // Test that functions are available
          console.log('🔧 Tooltip functions loaded:', typeof window.showTooltip, typeof window.hideTooltip);
          
          // Also define as global functions for immediate availability
          function showTooltip(tooltipId) {
            return window.showTooltip(tooltipId);
          }
          
          function hideTooltip(tooltipId) {
            return window.hideTooltip(tooltipId);
          }
        </script>
      </body>
    `;
  }

  async renderPage(body, title) {
    const timestamp = Date.now();
    const displayDomain = await this.getDisplayDomain();
    console.log('🔧 renderPage: displayDomain =', displayDomain);
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <link rel="stylesheet" href="/sys-dashboard.css?v=${timestamp}">
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        <!-- DEBUG: Page rendered at ${new Date().toISOString()} -->
        <script>
          // Define tooltip functions early in head
          function showTooltip(tooltipId) {
            console.log('🔍 Showing tooltip:', tooltipId);
            const tooltip = document.getElementById(tooltipId);
            if (tooltip) {
              console.log('✅ Tooltip found, showing:', tooltip);
              tooltip.style.display = 'block';
            } else {
              console.error('❌ Tooltip not found:', tooltipId);
            }
          }
          
          function hideTooltip(tooltipId) {
            console.log('🔍 Hiding tooltip:', tooltipId);
            const tooltip = document.getElementById(tooltipId);
            if (tooltip) {
              tooltip.style.display = 'none';
            }
          }
          
          console.log('🔧 Early tooltip functions loaded');
        </script>
      </head>
      <body>
        <div class="container">
          ${body}
        </div>
        <script>
          // Force cache override
          if (window.location.pathname.includes('/edit') && !window.location.search.includes('nocache')) {
            const separator = window.location.search ? '&' : '?';
            window.location.href = window.location.href + separator + 'nocache=' + Date.now();
          }
          
          // Load settings from API
          let appSettings = null;
          
          async function loadSettings() {
            try {
              const response = await fetch('/api/settings');
              appSettings = await response.json();
            } catch (error) {
              console.error('Failed to load settings:', error);
              // Fallback settings
              appSettings = {
                image_upload: { compression_enabled: true, image_quality: 0.8, max_image_dimension: 1920 },
                ui_text: {
                  single_upload: { choose_file: "Choose File", uploading: "Uploading..." },
                  multiple_upload: { 
                    drag_drop_text: "Drag & drop files here, or",
                    browse_button: "Browse",
                    file_size_limit: "Maximum file size: 10MB"
                  }
                },
                compression_settings: {
                  ole_single: { max_width: 1920, max_height: 1920, quality: 0.8, convert_to_jpeg: true },
                  ole_multiple: { max_width: 1200, max_height: 1200, quality: 0.8, convert_to_jpeg: true }
                }
              };
            }
          }
          
          // Image compression function
          function compressImage(file, compressionType = 'ole_single') {
            return new Promise((resolve) => {
              console.log(\`🎯 Starting compression for: \${file.name} (Type: \${compressionType})\`);
              console.log(\`⚙️ Settings loaded:\`, appSettings);
              
              // Check compression enabled (support both old and new format)
              const compressionEnabled = appSettings?.image_upload?.compression_enabled || 
                                        appSettings?.compression_enabled === "Yes" || 
                                        appSettings?.compression_enabled === true;
              
              if (!compressionEnabled) {
                console.log(\`❌ Compression disabled in settings\`);
                resolve(file);
                return;
              }
              
              console.log(\`✅ Compression enabled!\`);
              
              // Get compression settings (support both old and new format)
              let settings;
              if (appSettings.compression_settings && appSettings.compression_settings[compressionType]) {
                settings = appSettings.compression_settings[compressionType];
              } else {
                // Fallback to old format or defaults
                settings = {
                  max_width: parseInt(appSettings.max_image_dimension) || 1920,
                  max_height: parseInt(appSettings.max_image_dimension) || 1920,
                  quality: parseFloat(appSettings.image_quality) || 0.8,
                  convert_to_jpeg: true
                };
              }
              
              console.log(\`🔧 Using compression settings:\`, settings);
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const img = new Image();
              
              img.onload = () => {
                // Calculate new dimensions
                const ratio = Math.min(
                  settings.max_width / img.width,
                  settings.max_height / img.height,
                  1 // Don't upscale
                );
                
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                
                // Draw image
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Convert to blob
                const outputFormat = settings.convert_to_jpeg ? 'image/jpeg' : file.type;
                const quality = settings.quality;
                
                canvas.toBlob((blob) => {
                  // Create new file with original name but potentially new extension
                  let newFileName = file.name;
                  if (settings.convert_to_jpeg && !file.name.toLowerCase().endsWith('.jpg') && !file.name.toLowerCase().endsWith('.jpeg')) {
                    newFileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
                  }
                  
                  const compressedFile = new File([blob], newFileName, {
                    type: outputFormat,
                    lastModified: Date.now()
                  });
                  
                  const originalSizeMB = (file.size/1024/1024).toFixed(2);
                  const compressedSizeMB = (compressedFile.size/1024/1024).toFixed(2);
                  const compressionRatio = ((1 - compressedFile.size/file.size) * 100).toFixed(1);
                  
                  console.log(\`🗜️ COMPRESSION RESULT:\`);
                  console.log(\`📁 File: \${file.name}\`);
                  console.log(\`📏 Original: \${originalSizeMB}MB (\${file.size} bytes)\`);
                  console.log(\`📦 Compressed: \${compressedSizeMB}MB (\${compressedFile.size} bytes)\`);
                  console.log(\`📊 Reduction: \${compressionRatio}%\`);
                  console.log(\`🎨 Format: \${file.type} → \${compressedFile.type}\`);
                  
                  resolve(compressedFile);
                }, outputFormat, quality);
              };
              
              img.onerror = () => {
                console.error('Failed to load image for compression');
                resolve(file);
              };
              
              img.src = URL.createObjectURL(file);
            });
          }

          // Global functions moved to top of script

          // Global function to delete uploaded image
          window.deleteUploadedImage = function(fieldName) {
            window.clearImage(fieldName);
          };

          document.addEventListener('DOMContentLoaded', async () => {
            // Load settings first
            await loadSettings();
            // Add CSS animations
            const style = document.createElement('style');
            style.textContent = \`
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              @keyframes fadeOut { 0% { opacity: 1; } 100% { opacity: 0; } }
              .spinner { animation: spin 1s linear infinite; display: inline-block; }
            \`;
            document.head.appendChild(style);

            // Handle drag & drop zones
            document.querySelectorAll('.drag-drop-zone').forEach(zone => {
              const fieldName = zone.dataset.field;
              
              // Drag & drop events
              zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
              });
              
              zone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
              });
              
              zone.addEventListener('drop', async (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files);
                const imageFiles = files.filter(file => file.type.startsWith('image/'));
                
                if (imageFiles.length > 0) {
                  await handleMultipleFileUpload(fieldName, imageFiles);
                }
              });
            });
            
            // Handle single file uploads (OLE)
            document.querySelectorAll('input[type="file"][data-target]:not([multiple])').forEach(input => {
              input.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (!file) return;

                const targetId = event.target.dataset.target;
                const hiddenInput = document.getElementById(targetId);
                const statusElement = document.getElementById(targetId + '-status');
                const submitButton = document.querySelector('form button[type="submit"]');

                // Modern loading state
                statusElement.innerHTML = '<span style="color: #007bff; font-size: 16px;">⟳</span> Compressing image...';
                statusElement.style.color = '#007bff';
                if (submitButton) submitButton.disabled = true;

                try {
                  // Compress image first
                  const compressedFile = await compressImage(file, 'ole_single');
                  
                  // Use proxy upload instead of presigned URLs to bypass CORS
                  const formData = new FormData();
                  formData.append('file', compressedFile);

                  statusElement.innerHTML = '<span style="color: #007bff; font-size: 16px;">⟳</span> Uploading ' + compressedFile.name + '...';

                  const response = await fetch('/api/upload-file', {
                    method: 'POST',
                    body: formData,
                  });

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.details || 'Upload failed.');
                  }
                  
                  const { publicUrl, objectKey } = await response.json();

                  // Store just the filename in the hidden field (for JSON storage)
                  hiddenInput.value = objectKey;
                  const viewUrl = objectKey.startsWith('http') ? objectKey : 'https://' + window.CLIENT_DOMAIN + '/' + objectKey;
                  
                  // Show success with controls (no checkmark)
                  statusElement.innerHTML = 
                    '<div style="display: flex; align-items: center; gap: 8px;">' +
                      '<button type="button" class="ole-preview-uploaded" data-url="' + viewUrl + '" style="background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 4px; color: #007bff;" title="Preview image">' +
                        '<span style="font-size: 16px;">👁️</span>' +
                      '</button>' +
                      '<button type="button" class="ole-delete-uploaded" data-target="' + targetId + '" style="background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 4px; color: #dc3545;" title="Delete image">' +
                        '<span style="font-size: 16px;">🗑️</span>' +
                      '</button>' +
                    '</div>';
                  statusElement.className = 'upload-status success';

                } catch (error) {
                  console.error('File upload process failed:', error);
                  statusElement.innerHTML = \`<span style="color: #dc3545; font-size: 16px;">❌</span> Error: \${error.message}\`;
                  statusElement.style.color = '#dc3545';
                  hiddenInput.value = '';
                } finally {
                  if (submitButton) submitButton.disabled = false;
                }
              });
            });
            
            // Handle multiple file uploads (OLE_MULTIPLE)
            document.querySelectorAll('input[type="file"][data-target][multiple]').forEach(input => {
              input.addEventListener('change', async (event) => {
                const files = Array.from(event.target.files);
                if (files.length === 0) return;
                
                const fieldName = event.target.dataset.target;
                await handleMultipleFileUpload(fieldName, files);
              });
            });
            
            // Multiple file upload handler
            async function handleMultipleFileUpload(fieldName, files) {
              const hiddenInput = document.getElementById(fieldName);
              const statusElement = document.getElementById(fieldName + '-status');
              const submitButton = document.querySelector('form button[type="submit"]');
              
              // Get existing images
              let existingImages = [];
              try {
                const existingValue = hiddenInput.value;
                if (existingValue && existingValue !== '[]') {
                  existingImages = JSON.parse(existingValue);
                }
              } catch (e) {
                existingImages = [];
              }
              
              statusElement.innerHTML = \`<span style="color: #007bff; font-size: 16px;">⟳</span> Compressing \${files.length} image(s)...\`;
              statusElement.className = 'upload-status-multi uploading';
              if (submitButton) submitButton.disabled = true;
              
              try {
                // Compress all images first
                const compressedFiles = await Promise.all(
                  files.map(file => compressImage(file, 'ole_multiple'))
                );
                
                statusElement.innerHTML = \`<span style="color: #007bff; font-size: 16px;">⟳</span> Uploading \${compressedFiles.length} file(s)...\`;
                
                const uploadPromises = compressedFiles.map(async (file) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  
                  const response = await fetch('/api/upload-file', {
                    method: 'POST',
                    body: formData,
                  });
                  
                  if (!response.ok) {
                    throw new Error(\`Failed to upload \${file.name}\`);
                  }
                  
                  const result = await response.json();
                  return result.objectKey;
                });
                
                const uploadedFiles = await Promise.all(uploadPromises);
                const allImages = [...existingImages, ...uploadedFiles];
                
                // Update hidden input with all images
                hiddenInput.value = JSON.stringify(allImages);
                
                statusElement.innerHTML = \`<span style="color: #28a745; font-size: 16px;">✅</span> Successfully uploaded \${files.length} file(s)!\`;
                statusElement.className = 'upload-status-multi success';
                
                // Refresh the page to show new images
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
                
              } catch (error) {
                console.error('Multiple file upload failed:', error);
                statusElement.innerHTML = \`<span style="color: #dc3545; font-size: 16px;">❌</span> Error: \${error.message}\`;
                statusElement.className = 'upload-status-multi error';
              } finally {
                if (submitButton) submitButton.disabled = false;
              }
            }
          });
        </script>
      </body>
    `;
  }

  async processLovJson(lovJsonString, fieldName, selectedValue = '', commonAttrString = '') {
    console.log(`🔍 Processing lov_json for field ${fieldName}:`, lovJsonString);
    
    // Check if it's a SQL query format
    if (lovJsonString.trim().toUpperCase().startsWith('SELECT')) {
      console.log(`📊 Detected SQL query format for field ${fieldName}`);
      try {
        // Execute SQL query against D1 database
        const sqlQuery = lovJsonString.replace(/{website_id}/g, '1'); // Replace placeholder with actual website_id
        console.log(`🗄️ Executing SQL query:`, sqlQuery);
        
        const result = await this.env.DB.prepare(sqlQuery).all();
        console.log(`📊 SQL query result:`, result);
        
        if (result.results && result.results.length > 0) {
          const optionsHtml = result.results.map(row => {
            // Use the first column as both value and display
            const firstColumnName = Object.keys(row)[0];
            const value = row[firstColumnName] || '';
            const isSelected = value === selectedValue;
            return `<option value="${value}" ${isSelected ? 'selected' : ''}>${value}</option>`;
          }).join('');
          
          return `<select id="${fieldName}" name="${fieldName}" ${commonAttrString}>
            <option value="">-- Select --</option>
            ${optionsHtml}
          </select>`;
        } else {
          return `<select id="${fieldName}" name="${fieldName}" ${commonAttrString}>
            <option value="">-- No data found --</option>
          </select>`;
        }
      } catch (error) {
        console.error(`❌ Error executing SQL query for ${fieldName}:`, error);
        return `<select id="${fieldName}" name="${fieldName}" ${commonAttrString}>
          <option value="">-- SQL query error --</option>
          <option value="Custom">Custom Entry</option>
        </select>`;
      }
    }
    
    // Parse the LOVsystem query: lov_json=LOVsystem(file=sys-menus-lov.json, fields={menu,sub_menu}, where={group:['Article','Form']}, order:Ascending)
    const match = lovJsonString.match(/LOVsystem\s*\(\s*([^)]+)\s*\)/i);
    if (!match) {
      console.error('Invalid LOVsystem format:', lovJsonString);
      return `<select id="${fieldName}" name="${fieldName}" ${commonAttrString}><option value="">Invalid LOVsystem format</option></select>`;
    }
    
    // Parse parameters
    const params = {};
    const paramString = match[1];
    
    // Extract file parameter
    const fileMatch = paramString.match(/file\s*=\s*([^,\s]+)/i);
    const fileName = fileMatch ? fileMatch[1].trim() : 'sys-menus-lov.json';
    
    // Extract fields parameter
    const fieldsMatch = paramString.match(/fields\s*=\s*\{([^}]+)\}/i);
    const fields = fieldsMatch ? fieldsMatch[1].split(',').map(f => f.trim()) : ['menu', 'sub_menu'];
    
    // Extract where parameter - support any field name, not just 'group'
    const whereMatch = paramString.match(/where\s*=\s*\{([^}]+)\}/i);
    let whereCondition = null;
    if (whereMatch) {
      const whereString = whereMatch[1];
      // Generic pattern to match any field: field_name:['value1','value2'] or field_name:['value']
      const fieldMatch = whereString.match(/(\w+)\s*:\s*\[([^\]]+)\]/i);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldValues = fieldMatch[2].split(',').map(v => v.trim().replace(/['"]/g, ''));
        whereCondition = {
          field: fieldName,
          values: fieldValues
        };
        console.log(`🔍 Where condition parsed: ${fieldName} IN [${fieldValues.join(', ')}]`);
      }
    }
    
    // Extract order parameter
    const orderMatch = paramString.match(/order\s*:\s*(\w+)/i);
    const orderDirection = orderMatch ? orderMatch[1].toLowerCase() : null;
    
    try {
      // Load the JSON file
      const lovFile = await this.r2.get(fileName);
      if (!lovFile) {
        return `<select id="${fieldName}" name="${fieldName}"><option value="">File not found: ${fileName}</option></select>`;
      }
      
      const lovData = await lovFile.json();
      let items = lovData.menus || lovData.items || lovData;
      
      // Apply where condition if specified - support any field name
      if (whereCondition && whereCondition.field) {
        const fieldName = whereCondition.field;
        const originalCount = items.length;
        
        items = items.filter(item => {
          // Check both exact case and capitalized version of field name
          const fieldValue = item[fieldName] || item[fieldName.charAt(0).toUpperCase() + fieldName.slice(1)];
          const isMatch = whereCondition.values.includes(fieldValue);
          return isMatch;
        });
        
        console.log(`🔍 Filtered by ${fieldName}: ${originalCount} → ${items.length} items`);
      }
      
      // Apply sorting if order parameter is specified
      if (orderDirection === 'ascending' || orderDirection === 'descending') {
        console.log(`🔄 Applying ${orderDirection} sort to ${items.length} items`);
        items.sort((a, b) => {
          // Create the display value for comparison (same logic as option display)
          const aDisplay = fields.length > 1 ? 
            `${a[fields[0]] || ''} - ${a[fields[1]] || ''}` : 
            (a[fields[0]] || '');
          const bDisplay = fields.length > 1 ? 
            `${b[fields[0]] || ''} - ${b[fields[1]] || ''}` : 
            (b[fields[0]] || '');
          
          // Compare the display values
          const comparison = aDisplay.localeCompare(bDisplay, undefined, { 
            numeric: true, 
            sensitivity: 'base' 
          });
          
          return orderDirection === 'ascending' ? comparison : -comparison;
        });
      }
      
      // Generate options HTML
      const optionsHtml = items.map(item => {
        // For multi-field LOVs, use concatenated value for both value and display
        const optionDisplay = fields.length > 1 ? 
          `${item[fields[0]] || ''} - ${item[fields[1]] || ''}` : 
          (item[fields[0]] || '');
        
        // Use the display value as the option value to store the full concatenated string
        const optionValue = optionDisplay;
        
        const isSelected = optionValue === selectedValue;
        return `<option value="${optionValue}" ${isSelected ? 'selected' : ''}>${optionDisplay}</option>`;
      }).join('');
      
      return `<select id="${fieldName}" name="${fieldName}" ${commonAttrString}>
        <option></option>
        ${optionsHtml}
      </select>`;
      
    } catch (error) {
      console.error('Error loading lov_json file:', error);
      return `<select id="${fieldName}" name="${fieldName}"><option value="">Error loading ${fileName}</option></select>`;
    }
  }

  async renderNewPage(config, formFields) {
    let formInputs = '';
    if (formFields && formFields.fields) {
      // Use the centralized form generation logic, passing an empty item object.
      formInputs = await this.generateFormFieldsHTML(formFields, {});
    } else {
      formInputs = `<p>Error: Form definition file not found or is invalid. Please check the file at <strong>${config.form_definition_file}</strong>.</p>`;
    }

    const body = `
        <h1>New ${config.label}</h1>
        <div class="page-actions">
          <a href="/${config.path}">Back to List</a>
        </div>
        <form method="POST" action="/${config.path}">
            ${formInputs}
            <button type="submit" ${(!formFields || !formFields.fields) ? 'disabled' : ''}>Create</button>
        </form>
    `;

    const html = await this.renderPage(body, `New ${config.label}`);
    return html;
  }

  renderDetailsPage(item, config) {
    if (!item) {
      return new Response('Item not found.', { status: 404 });
    }
    
    // Initialize details array if missing
    if (!item.details) {
      item.details = [];
    }
    
    if (item.details.length === 0) {
      // Show empty details page with option to add new details
      const emptyDetailsHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Details - ${config.label}</title>
            <link rel="stylesheet" href="/sys-dashboard.css">
        </head>
        <body>
            <h1>Details for ${config.label}</h1>
            <p>No details found for this item.</p>
            <a href="/${config.path}/${item[config.id_field]}/details/new" class="btn btn-primary">Add New Detail</a>
            <a href="/${config.path}" class="btn btn-secondary">Back to List</a>
        </body>
        </html>
      `;
      return new Response(emptyDetailsHtml, { headers: { 'Content-Type': 'text/html' } });
    }

    const detailHeaders = config.detail_columns.map(column => `<th>${column.label}</th>`).join('');

    const detailRows = item.details.map(detail => `
      <tr>
        ${config.detail_columns.map(column => `<td>${detail[column.name] || ''}</td>`).join('')}
        <td>
          <a href="/${config.path}/${item[config.id_field]}/details/${detail[config.detail_id_field || 'form_detail_id']}/edit">Edit</a>
          <a href="/${config.path}/${item[config.id_field]}/details/${detail[config.detail_id_field || 'form_detail_id']}/delete" class="delete-link">Delete</a>
        </td>
      </tr>
    `).join('');

    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Details for ${item[config.id_field]}</title>
        <link rel="stylesheet" href="/sys-dashboard.css">
      </head>
      <body>
        <div class="container">
          <div class="page-header">
            <h1>Details for ${item[config.id_field]}</h1>
            <div class="page-actions">
              <a href="/${config.path}">Back to List</a>
              <a href="/${config.path}/${item[config.id_field]}/details/new">New Detail</a>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                ${detailHeaders}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${detailRows}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }

  async renderDetailDeleteConfirmationPage(modulePath, itemId, detailId, config) {
    const body = `
      <h1>Confirm Deletion</h1>
      <p>Are you sure you want to delete this detail item?</p>
      <form method="POST" action="/${modulePath}/${itemId}/details/${detailId}/delete">
        <button type="submit">Yes, delete</button>
        <a href="/${modulePath}/${itemId}/details">No, cancel</a>
      </form>
    `;
    const html = await this.renderPage(body, `Confirm Delete`);
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  async renderNewDetailPage(item, config, formFields) {
    let formInputs = '';
    if (formFields && formFields.fields) {
      // Use the centralized form generation logic, passing an empty item object for the detail.
      formInputs = await this.generateFormFieldsHTML(formFields, {});
    } else {
      formInputs = `<p>Error: Form definition file not found or is invalid. Please check the file at <strong>${config.detail_form_definition_file}</strong>.</p>`;
    }

    const body = `
      <h1>New Field for ${item[config.id_field]}</h1>
      <form method="POST">
        ${formInputs}
        <button type="submit" ${(!formFields || !formFields.fields) ? 'disabled' : ''}>Create Detail</button>
      </form>
      <a href="/${config.path}/${item[config.id_field]}/details">Back to Details</a>
    `;

    const html = await this.renderPage(body, `New Detail`);
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  async renderDetailEditPage(item, detail, config, formFields) {
    // Check if detail was found
    if (!detail) {
      return new Response(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Detail Not Found</title>
          <link rel="stylesheet" href="/sys-dashboard.css">
        </head>
        <body>
          <div class="container">
            <h1>Detail Not Found</h1>
            <p>The requested detail record could not be found.</p>
            <a href="/${config.path}/${item[config.id_field]}/details">Back to Details</a>
          </div>
        </body>
        </html>
      `, { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    let formInputs = '';
    if (formFields && formFields.fields) {
      formInputs = await this.generateFormFieldsHTML(formFields, detail);
    } else {
      formInputs = `<p>Error: Form definition file not found or is invalid. Please check the file at <strong>${config.detail_form_definition_file}</strong>.</p>`;
    }

    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Edit Detail</title>
        <link rel="stylesheet" href="/sys-dashboard.css">
      </head>
      <body>
        <div class="container">
          <h1>Edit Field: ${detail.caption}</h1>
          <form method="POST">
            ${formInputs}
            <button type="submit" ${(!formFields || !formFields.fields) ? 'disabled' : ''}>Save Changes</button>
          </form>
          <a href="/${config.path}/${item[config.id_field]}/details">Back to Details</a>
        </div>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
}

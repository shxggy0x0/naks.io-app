# Naks.io - Land Tokenization Platform

A modern, blockchain-powered platform for land tokenization that provides trust, transparency, and simplicity in property ownership management.

## 🌟 Features

### Core Functionality
- **Survey Upload**: Complete form with all Bhoomi data fields (District, Taluk, Hobli, Village, Survey No., Surnoc, Hissa, Period)
- **Admin Approval Workflow**: Review and approve/reject survey submissions
- **Blockchain Integration**: ERC-721 token generation with Polygon testnet simulation
- **IPFS Storage**: Decentralized metadata storage simulation
- **Interactive Map**: Land parcel visualization with polygon drawing tools
- **Digital ID Cards**: Encrypted ownership certificates with QR codes

### User Roles
- **Landowner**: Upload survey documents and track approval status
- **Investor**: View tokenized land parcels and investment opportunities
- **Government Verifier**: Review and validate survey data
- **Admin**: Manage the entire tokenization process

### Technical Features
- **Responsive Design**: Modern, mobile-friendly interface
- **Real-time Updates**: Live status updates and notifications
- **File Upload**: Drag & drop document upload with validation
- **Map Integration**: Interactive map with land boundary marking
- **QR Code Generation**: Secure token verification
- **Blockchain Simulation**: Complete ERC-721 token lifecycle

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for map tiles and external libraries

### Installation
1. Clone or download the project files
2. Open `index.html` in your web browser
3. No additional setup required - everything runs client-side

### Quick Start
1. **Switch User Roles**: Click on your profile in the top-right to switch between Landowner, Investor, Govt Verifier, and Admin
2. **Upload Survey**: Navigate to "Survey Upload" and fill in the land details
3. **Review Approvals**: As an admin, go to "Approvals" to review pending submissions
4. **View Map**: Check the "Map View" to see tokenized land parcels
5. **Generate Tokens**: Approve surveys to generate ERC-721 tokens and digital ID cards

## 🏗️ Architecture

### Frontend
- **HTML5**: Semantic markup with accessibility features
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **JavaScript (ES6+)**: Vanilla JS with modern features
- **Leaflet.js**: Interactive mapping library
- **QRCode.js**: QR code generation

### Blockchain Integration
- **Token Standard**: ERC-721 (Non-Fungible Tokens)
- **Network**: Polygon Mumbai Testnet (simulated)
- **Storage**: IPFS for metadata and document storage
- **Smart Contracts**: Land tokenization and ownership management

### Data Flow
1. **Upload**: User uploads survey documents and land details
2. **Verification**: Admin reviews against government data
3. **Tokenization**: Approved surveys generate ERC-721 tokens
4. **Storage**: Metadata stored on IPFS with blockchain reference
5. **Mapping**: Land parcels displayed on interactive map
6. **Certification**: Digital ownership ID cards with QR codes

## 🎨 Design System

### Color Palette
- **Primary Blue**: #007BFF (trust and reliability)
- **Success Green**: #28a745 (approval and success)
- **Warning Yellow**: #ffc107 (pending and attention)
- **Danger Red**: #dc3545 (rejection and errors)
- **Neutral Grays**: #f8fafc, #e2e8f0, #64748b (backgrounds and text)

### Typography
- **Font Family**: Inter (clean, modern, highly readable)
- **Weights**: 300, 400, 500, 600, 700
- **Hierarchy**: Clear heading structure with consistent spacing

### Components
- **Cards**: Rounded corners with subtle shadows
- **Buttons**: Consistent styling with hover effects
- **Forms**: Clean input fields with validation states
- **Modals**: Centered overlays with backdrop blur
- **Notifications**: Toast-style messages with icons

## 📱 Responsive Design

The platform is fully responsive and works seamlessly across:
- **Desktop**: Full-featured experience with sidebar navigation
- **Tablet**: Optimized layout with collapsible sidebar
- **Mobile**: Touch-friendly interface with bottom navigation

## 🔧 Customization

### Adding New User Roles
1. Update the `switchUser()` function in `script.js`
2. Add new role styling in `styles.css`
3. Modify the user menu in `index.html`

### Extending Form Fields
1. Add new fields to the survey form in `index.html`
2. Update validation in `validateSurveyForm()` function
3. Add corresponding display logic in approval cards

### Customizing Map Features
1. Modify the `initializeMap()` function for different map providers
2. Add custom polygon drawing tools
3. Implement additional map controls

## 🚀 Demo Scenarios

### Scenario 1: Landowner Upload
1. Switch to "Landowner" role
2. Navigate to "Survey Upload"
3. Fill in land details and upload documents
4. Submit for approval

### Scenario 2: Admin Approval
1. Switch to "Admin" role
2. Go to "Approvals" section
3. Review pending survey submissions
4. Approve or reject with comments
5. Generate digital ID cards for approved surveys

### Scenario 3: Investor View
1. Switch to "Investor" role
2. Explore the "Map View" to see available land parcels
3. Click on parcels to view token details
4. Review blockchain transaction information

### Scenario 4: Government Verification
1. Switch to "Govt Verifier" role
2. Access detailed survey information
3. Verify against government databases
4. Provide verification status

## 🔒 Security Features

- **Data Validation**: Client-side and server-side validation
- **File Upload Security**: File type and size restrictions
- **Token Encryption**: Secure token generation with hashing
- **QR Code Verification**: Tamper-proof ownership verification
- **Blockchain Immutability**: Permanent ownership records

## 🌐 Browser Support

- **Chrome**: 90+ (recommended)
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+

## 📄 License

This project is created for demonstration purposes. All rights reserved.

## 🤝 Contributing

This is a demonstration project. For production use, please ensure:
- Proper backend integration
- Real blockchain connectivity
- Security audit and testing
- Compliance with local regulations

## 📞 Support

For questions or support regarding this demonstration:
- Review the code comments for implementation details
- Check the browser console for debugging information
- Ensure all external libraries are loading correctly

---

**Note**: This is a demonstration platform. For production deployment, additional security measures, backend integration, and compliance with local regulations are required.


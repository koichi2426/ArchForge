import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

// Helper function to determine type string, trying to resolve against domains/attributes
const resolveType = (fieldName: string, domains: any[]): string => {
    if (!fieldName) return 'any'; // Handle empty field names

    // Check if it's a primitive type or common type
    const primitiveTypes = ['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set']; // Add more as needed
    if (primitiveTypes.includes(fieldName)) {
        return fieldName;
    }

    // Check if it's a Domain name
    const domainMatch = domains.find(d => d.name === fieldName);
    if (domainMatch) {
        return domainMatch.name;
    }

    // Check if it's in "Domain.attribute" format
    const parts = fieldName.split('.');
    if (parts.length === 2) {
        const domain = domains.find(d => d.name === parts[0]);
        if (domain) {
            const attribute = domain.attributes.find((a: any) => a.name === parts[1]);
            if (attribute) return attribute.type; // Use attribute's type
        }
    }

    // Default to any if type cannot be resolved
    return 'any';
};

// Helper function to generate import statements
const generateImports = (dependencies: string[]): string => {
    if (dependencies.length === 0) return '';
    // Simple assumption: all dependencies are from the same relative path (e.g., '../domain')
    // A real implementation would need more sophisticated path resolution
    const domainImports = dependencies
        .filter(dep => !['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set', 'any'].includes(dep)) // Filter out primitive/built-in types
        .map(dep => `import { ${dep} } from './${dep.toLowerCase()}';`); // Assuming file names are lowercase

    return domainImports.join('\\n') + (domainImports.length > 0 ? '\\n\\n' : '');
};


// Generate content based on template logic
const generateDomainFileContent = (domain: any, allDomains: any[]): string => {
    const dependencies: string[] = [];
    // Collect types used in attributes and methods to generate imports
    domain.attributes.forEach((attr: any) => {
         const resolved = resolveType(attr.type, allDomains);
         if (resolved !== attr.type) dependencies.push(resolved); // Add if it's a domain type
    });
     domain.methods.forEach((method: any) => {
        const inputTypes = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
        inputTypes.forEach((type: string) => {
             const resolved = resolveType(type, allDomains);
             if (resolved !== type) dependencies.push(resolved);
        });
        const outputType = method.output.trim();
         const resolved = resolveType(outputType, allDomains);
         if (resolved !== outputType) dependencies.push(resolved);
    });

    const imports = generateImports(Array.from(new Set(dependencies))); // Use Set to avoid duplicates

    let content = imports;

    if (domain.domainType === 'entity' || domain.domainType === 'valueObject') {
         content += `export interface ${domain.name} {\\n`;
        domain.attributes.forEach((attr: any) => {
             const resolved = resolveType(attr.type, allDomains);
            content += `  ${attr.name}: ${resolved};\\n`;
        });
        if (domain.domainType === 'entity') { // Methods primarily for Entities/Domain Services in this template style
             domain.methods.forEach((method: any) => {
                const inputParams = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string, index: number) => `arg${index}: ${resolveType(type, allDomains)}`).join(', ');
                const outputType = resolveType(method.output.trim(), allDomains);
                content += `\\n  ${method.name}(${inputParams}): ${outputType};\\n`;
            });
        }
        content += `}\\n`;
    } else if (domain.domainType === 'domainService') {
         content += `export interface ${domain.name} {\\n`;
         domain.methods.forEach((method: any) => {
            const inputParams = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string, index: number) => `arg${index}: ${resolveType(type, allDomains)}`).join(', ');
            const outputType = resolveType(method.output.trim(), allDomains);
            content += `\\n  ${method.name}(${inputParams}): ${outputType};\\n`;
        });
         content += `}\\n`;
    }


    return content;
};

const generateRepositoryContent = (domainName: string): string => {
    // Basic repository interface
    let content = `import { ${domainName} } from './${domainName.toLowerCase()}';\\n\\n`; // Assuming Entity is in the same dir
    content += `export interface ${domainName}Repository {\\n`;
    content += `  findById(id: string): Promise<${domainName} | null>;\\n`;
    content += `  save(${domainName.toLowerCase()}: ${domainName}): Promise<void>;\\n`;
    content += `  // Add other repository methods as needed (e.g., findAll, delete)\\n`;
    content += `}\\n`;
    return content;
};


const generateUsecaseContent = (usecase: any, allDomains: any[]): string => {
    // This closely follows the usecase.hbs template structure
    const inputInterfaceName = `${usecase.name}Input`;
    const outputInterfaceName = `${usecase.name}Output`;
    const usecaseInterfaceName = `I${usecase.name}UseCase`;
    const interactorName = `${usecase.name}Interactor`;
    const factoryFunctionName = `create${usecase.name}UseCase`;
    const presenterName = `${usecase.name}Presenter`; // Placeholder, actual presenter might be in Adapter

     // Resolve input/output field types
    const inputFields = usecase.inputFields.map((f: any) => ({ name: f.name, type: resolveType(f.name, allDomains) }));
    const outputFields = usecase.outputFields.map((f: any) => ({ name: f.name, type: resolveType(f.name, allDomains) }));

    const dependencies: string[] = [];
    // Simple dependency detection: look for Repository names in usecase definition (manual for now)
    // A real implementation would parse the usecase's input/output fields or have explicit dependencies
    // For now, let's assume usecases might depend on Repositories of Entities used in input/output
     [...inputFields, ...outputFields].forEach(field => {
         const domainName = field.type; // If the type resolved to a domain name
         const domain = allDomains.find(d => d.name === domainName && d.domainType === 'entity');
         if (domain) {
             dependencies.push(`${domain.name}Repository`); // Add repository dependency
         }
     });


     const imports = generateImports(Array.from(new Set(dependencies)));

    let content = imports;

    content += `// ${usecase.name} Usecase\\n\\n`;

    // Input Port Interface
    content += `export interface ${inputInterfaceName} {\\n`;
    inputFields.forEach((field: any) => {
        content += `  ${field.name}: ${field.type};\\n`;
    });
    content += `}\\n\\n`;

    // Output Port Interface
    content += `export interface ${outputInterfaceName} {\\n`;
     outputFields.forEach((field: any) => {
        content += `  ${field.name}: ${field.type};\\n`;
    });
    content += `}\\n\\n`;

    // Usecase Interface (Input Port)
    content += `export interface ${usecaseInterfaceName} {\\n`;
    content += `  execute(input: ${inputInterfaceName}): Promise<${outputInterfaceName}>;\\n`;
    content += `}\\n\\n`;

     // Factory Function (Simplified)
    const factoryDeps = dependencies.map(dep => ({ name: dep.toLowerCase().replace('repository', 'Repo'), type: dep })); // Basic dep naming
    content += `export function ${factoryFunctionName}(\\n`;
    factoryDeps.forEach((dep, index) => {
         content += `  ${dep.name}: ${dep.type}${index < factoryDeps.length - 1 ? ',' : ''}\\n`;
    });
    content += `): ${usecaseInterfaceName} {\\n`;
    content += `  return new ${interactorName}(${factoryDeps.map(dep => dep.name).join(', ')});\\n`;
    content += `}\\n\\n`;


    // Usecase Interactor (Core Logic)
    content += `export class ${interactorName} implements ${usecaseInterfaceName} {\\n`;
    content += `  constructor(\\n`;
     factoryDeps.forEach((dep, index) => {
         content += `    private readonly ${dep.name}: ${dep.type}${index < factoryDeps.length - 1 ? ',' : ''}\\n`;
    });
    content += `  ) {\\n`;
    content += `    // Dependencies injected\\n`;
    content += `  }\\n\\n`;

    content += `  async execute(input: ${inputInterfaceName}): Promise<${outputInterfaceName}> {\\n`;
    content += `    // TODO: Implement usecase logic here\\n`;
    content += `    console.log(\'Executing ${usecase.name} with input:\', input);\\n`;

    // Example of using a repository (if one was detected as a dependency)
    // This is highly simplified and depends on naming conventions
    if (dependencies.some(dep => dep.endsWith('Repository'))) {
        content += `    // Example: Using a repository dependency\\n`;
        dependencies.filter(dep => dep.endsWith('Repository')).forEach(repoDep => {
             const repoName = repoDep.toLowerCase().replace('repository', 'Repo');
             content += `    // const entity = await this.${repoName}.findById(input.someEntityId);\\n`;
        });
    }

    content += `    \\n`; // Add a newline before output
    content += `    const output: ${outputInterfaceName} = {}; // Initialize output object\\n`;
     outputFields.forEach((field: any) => {
         // Add placeholder comments for output fields
        content += `    // output.${field.name} = /* calculate value */ ${field.type === 'any' ? '{}' : ''};\\n`;
    });


    content += `    return Promise.resolve(output);\\n`;
    content += `  }\\n`;
    content += `}\\n`;

    return content;
};

// Generate basic Adapter file
const generateAdapterFile = (name: string): string => {
    let content = `// ${name} Adapter\\n\\n`;
    content += `// This file contains adapters for external services or entry points (e.g., API controllers, database gateways).\\n`;
    content += `// Implement interfaces defined in the Domain or Usecase layers here.\\n\\n`;
     content += `export class ${name}Adapter {\\n`;
     content += `  constructor() {\\n    // Dependencies on infrastructure implementations\\n  }\\n\\n`;
     content += `  // Implement adapter methods\\n`;
     content += `}\\n`;
    return content;
}

// Generate basic Infrastructure file
const generateInfrastructureFile = (name: string): string => {
    let content = `// ${name} Infrastructure Implementation\\n\\n`;
    content += `// This file contains concrete implementations of interfaces defined in higher layers.\\n`;
    content += `// Interact with databases, external APIs, frameworks here.\\n\\n`;
     content += `export class ${name}Infrastructure {\\n`;
     content += `  constructor() {\\n    // Framework specifics, database connections etc.\\n  }\\n\\n`;
     content += `  // Implement concrete methods\\n`;
     content += `}\\n`;
    return content;
}


export async function POST(req: NextRequest) {
  const { projectName, language, domains, usecases } = await req.json();

  if (language !== 'typescript') {
       // For now, only TypeScript is supported
       return new NextResponse(JSON.stringify({ error: 'Only TypeScript is supported for code generation.' }), {
           status: 400,
           headers: { 'Content-Type': 'application/json' },
       });
   }


  const zip = new JSZip();

  // Create core directories
  const domainFolder = zip.folder('domain');
  const usecaseFolder = zip.folder('usecase');
  const adapterFolder = zip.folder('adapter');
  const infrastructureFolder = zip.folder('infrastructure');
   // const presentationFolder = zip.folder('presentation'); // Often included layer

  // Add files to domain folder
  if (domainFolder) {
    domains.forEach((domain: any) => {
        // Generate main domain file (Entity, ValueObject, or DomainService)
        const domainFileName = `${domain.name}.ts`;
        domainFolder.file(domainFileName, generateDomainFileContent(domain, domains));

        // If it's an Entity, also add a Repository interface
        if (domain.domainType === 'entity') {
            const repoFileName = `${domain.name}Repository.ts`;
            domainFolder.file(repoFileName, generateRepositoryContent(domain.name));
        }
    });
  }

  // Add files to usecase folder
  if (usecaseFolder) {
    usecases.forEach((usecase: any) => {
      const usecaseFileName = `${usecase.name}UseCase.ts`;
      usecaseFolder.file(usecaseFileName, generateUsecaseContent(usecase, domains));
    });
  }

  // Add basic files to other folders
  if (adapterFolder) {
       // adapterFolder.file('README.md', '## Adapter Layer\\n\\nThis layer contains adapters for external services (e.g., databases, APIs) and entry points (e.g., controllers, gateways). Implementations of interfaces defined in Domain/Usecase layers reside here.');
        // Example adapter file
        // adapterFolder.file('ExampleApiAdapter.ts', generateAdapterFile('ExampleApi'));

       const apiAdapterFolder = adapterFolder.folder('api');
       if (apiAdapterFolder) {
            apiAdapterFolder.file('README.md', '## API Adapters\\n\\nThis directory contains adapters for external APIs or defining API interfaces.');
       }

       const presenterAdapterFolder = adapterFolder.folder('presenter');
       if (presenterAdapterFolder) {
            presenterAdapterFolder.file('README.md', '## Presenter Adapters\\n\\nThis directory contains adapters for formatting data for the presentation layer.');
       }

       const repositoryAdapterFolder = adapterFolder.folder('repository');
       if (repositoryAdapterFolder) {
            repositoryAdapterFolder.file('README.md', '## Repository Implementations\\n\\nThis directory contains concrete implementations of repository interfaces defined in the domain layer.');
       }

  }
  if (infrastructureFolder) {
       infrastructureFolder.file('README.md', '## Infrastructure Layer\\n\\nThis layer contains concrete implementations of interfaces defined in higher layers.\\n\\nInteract with databases, external APIs, frameworks here.');
        // Example infrastructure file
        // infrastructureFolder.file('ExampleDatabaseClient.ts', generateInfrastructureFile('ExampleDatabase'));
  }
   // if (presentationFolder) {
   //      presentationFolder.file('README.md', '## Presentation Layer\\n\\nThis layer contains the user interface (UI) or API endpoints (controllers) that interact with the Usecases. It orchestrates the flow and presents data to the user.');
   //       // Example presentation file (e.g., a simple controller placeholder)
   //       presentationFolder.file('ExampleController.ts', '// Example Controller\\n\\n// This would typically receive input, call a Usecase, and format the output.');
   // }


  // Add a root README
  zip.file('README.md', `# ${projectName || 'My Clean Architecture Project'}\n\nThis is a project generated with a basic Clean Architecture structure in TypeScript.`);
  // zip.file('.gitignore', 'node_modules\ndist\nbuild\n.env'); // Basic gitignore
   // zip.file('package.json', JSON.stringify({ // Basic package.json


  const content = await zip.generateAsync({ type: 'uint8array' });

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${(projectName && projectName.length > 0) ? projectName : 'project'}.zip"`,
    },
  });
} 
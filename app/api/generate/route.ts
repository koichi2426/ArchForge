import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// Load and compile Handlebars template
const loadTemplate = (templatePath: string): HandlebarsTemplateDelegate => {
    const fullPath = path.join(process.cwd(), 'templates', templatePath);
    try {
        const source = fs.readFileSync(fullPath, 'utf-8');
        return Handlebars.compile(source);
    } catch (error) {
        console.error(`Error loading template ${templatePath}:`, error);
        return Handlebars.compile('// Error loading template\n');
    }
};

const entityTemplate = loadTemplate('ts/domain/entity.hbs');
const valueObjectTemplate = loadTemplate('ts/domain/valueObject.hbs');
const domainServiceTemplate = loadTemplate('ts/domain/domain_service.hbs');
const repositoryTemplate = loadTemplate('ts/domain/repository.hbs');
const usecaseTemplate = loadTemplate('ts/usecase/usecase.hbs');
const actionTemplate = loadTemplate('ts/adapter/action.hbs');

const generateDomainFileContent = (domain: any, allDomains: any[], language: string): string => {
    const dependencies: string[] = [];

    domain.attributes.forEach((attr: any) => {
        dependencies.push(attr.type);
    });

    domain.methods.forEach((method: any) => {
        const inputTypes = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
        inputTypes.forEach((type: string) => dependencies.push(type));
        dependencies.push(method.output.trim());
    });

    const uniqueDependencies = Array.from(new Set(dependencies))
        .filter(dep => !['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set', 'any', domain.name].includes(dep))
        .map(dep => ({
            name: dep.charAt(0).toUpperCase() + dep.slice(1),
            from: `./${dep.charAt(0).toLowerCase() + dep.slice(1)}`
        }));

    const propertiesData = domain.attributes.map((attr: any) => ({
        name: attr.name,
        type: attr.type.charAt(0).toUpperCase() + attr.type.slice(1),
    }));

    const methodsData = domain.methods.map((method: any) => ({
        name: method.name,
        inputs: method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string) => type.charAt(0).toUpperCase() + type.slice(1)),
        output: method.output.trim().charAt(0).toUpperCase() + method.output.trim().slice(1),
    }));

    const templateData = {
        name: domain.name,
        imports: uniqueDependencies,
        properties: propertiesData,
        methods: methodsData,
        domainType: domain.domainType,
    };

    if (domain.domainType === 'entity') {
        return entityTemplate(templateData);
    } else if (domain.domainType === 'valueObject') {
        return valueObjectTemplate(templateData);
    } else if (domain.domainType === 'domainService') {
        return domainServiceTemplate(templateData);
    }

    return '';
};

const generateRepositoryContent = (domain: any, language: string): string => {
    const domainName = domain.name;
    const varName = domainName.charAt(0).toLowerCase() + domainName.slice(1);

    // リポジトリで必要となるエンティティのインポート情報を生成
    const imports = [];
    // エンティティ名（先頭大文字）
    const entityTypeName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
    // インポート元のファイルパス（先頭小文字）
    const entityFileName = domainName.charAt(0).toLowerCase() + domainName.slice(1);

    imports.push({
        name: entityTypeName,
        from: `./${entityFileName}`,
    });

    const templateData = {
        name: `${domainName}Repository`,
        imports: imports, // インポート情報を追加
        methods: [
            { name: 'findById', inputs: ['id: string'], output: `${domainName} | null` },
            { name: 'save', inputs: [`${varName}: ${domainName}`], output: 'void' },
            { name: 'delete', inputs: ['id: string'], output: 'void' },
            { name: 'exists', inputs: ['id: string'], output: 'boolean' },
        ],
    };

    return repositoryTemplate(templateData);
};

const generateUsecaseContent = (usecase: any, allDomains: any[], language: string): string => {
    const inputInterfaceName = `${usecase.name}Input`;
    const outputInterfaceName = `${usecase.name}Output`;
    const usecaseInterfaceName = `I${usecase.name}UseCase`;
    const interactorName = `${usecase.name}Interactor`;

    // 名前の先頭を大文字にする関数
    const toTypeName = (name: string): string =>
        name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Any';

    const normalizeFields = (fields: any[]) =>
        (fields || []).map(f => {
            const type = toTypeName(f.name);
            return { name: f.name, type };
        });

    const inputFields = normalizeFields(usecase.inputFields);
    const outputFields = normalizeFields(usecase.outputFields);

    // import対象型を抽出（重複除去）
    const typeNames = Array.from(new Set([
        ...inputFields.map(f => f.type),
        ...outputFields.map(f => f.type),
    ]));

    const imports = typeNames
        .filter(type => !['string', 'number', 'boolean', 'any'].includes(type)) // primitive除外
        .map(type => ({
            name: type,
            from: `../domain/${type.toLowerCase()}`,
        }));

    // ✅ outputFields が1つならその型を presenter.inputType に使う
    const presenterInputType = outputFields.length === 1 ? outputFields[0].type : outputInterfaceName;
    const presenterInputArg = outputFields.length === 1 ? outputFields[0].name : 'output';

    const templateData = {
        imports,
        inputInterface: {
            name: inputInterfaceName,
            fields: inputFields,
        },
        outputInterface: {
            name: outputInterfaceName,
            fields: outputFields,
        },
        presenter: {
            name: `${usecase.name}Presenter`,
            inputArg: presenterInputArg,
            inputType: presenterInputType,
        },
        usecaseInterface: {
            name: usecaseInterfaceName,
        },
        repository: {
            type: `${outputFields[0].name}Repository`,
        },
        factoryFunction: {
            name: `create${usecase.name}UseCase`,
        },
        interactor: {
            name: interactorName,
        },
    };

    // リポジトリのインポートを追加 (型名を大文字化して使用)
    if (outputFields.length > 0) {
        const repoTypeName = `${outputFields[0].type}Repository`;
        const repoFileName = `${outputFields[0].type.charAt(0).toLowerCase() + outputFields[0].type.slice(1)}repository`;
        imports.push({
            name: repoTypeName,
            from: `../domain/${repoFileName}`,
        });
    }

    return usecaseTemplate(templateData);
};


const generateAdapterFile = (name: string, language: string): string => {
    return `export class ${name}Adapter {\n  constructor() {}\n}\n`;
};

const generateInfrastructureFile = (name: string, language: string): string => {
    return `export class ${name}Infrastructure {\n  constructor() {}\n}\n`;
};

export async function POST(req: NextRequest) {
    const { projectName, language, domains, usecases } = await req.json();

    if (language !== 'typescript') {
        return new NextResponse(JSON.stringify({ error: 'Only TypeScript is supported for code generation.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const zip = new JSZip();
    const domainFolder = zip.folder('domain');
    const usecaseFolder = zip.folder('usecase');
    const adapterFolder = zip.folder('adapter');
    const infrastructureFolder = zip.folder('infrastructure');

    if (domainFolder) {
        domains.forEach((domain: any) => {
            const domainFileName = `${domain.name}.ts`;
            domainFolder.file(domainFileName, generateDomainFileContent(domain, domains, language));

            if (domain.domainType === 'entity') {
                const repoFileName = `${domain.name}Repository.ts`;
                domainFolder.file(repoFileName, generateRepositoryContent(domain, language));
            }
        });
    }

    if (usecaseFolder) {
        usecases.forEach((usecase: any) => {
            const usecaseFileName = `${usecase.name}UseCase.ts`;
            usecaseFolder.file(usecaseFileName, generateUsecaseContent(usecase, domains, language));
        });
    }

    // Actionファイルを生成してadapter/apiフォルダに追加
    const apiAdapterFolder = adapterFolder ? adapterFolder.folder('api') : null;
    if (apiAdapterFolder) {
        usecases.forEach((usecase: any) => {
            const actionFileName = `${usecase.name}Action.ts`;
            // Actionテンプレートに渡すデータを生成
            const templateData = {
                className: `${usecase.name}Action`,
                usecaseInterface: `I${usecase.name}UseCase`,
                inputType: `${usecase.name}Input`,
                outputType: `${usecase.name}Output`,
                errorTarget: usecase.name, // エラーメッセージに使用
                // インポート情報の生成
                imports: [
                    {
                        from: `../../usecase/${usecase.name}UseCase`,
                        names: [
                            `I${usecase.name}UseCase`,
                            `${usecase.name}Input`,
                            `${usecase.name}Output`,
                        ],
                    },
                ],
            };
            apiAdapterFolder.file(actionFileName, actionTemplate(templateData));
        });
        apiAdapterFolder.file('README.md', '## API Adapters'); // 既存のREADMEを残すか必要に応じて調整
    }

    if (adapterFolder) {
        const presenterAdapterFolder = adapterFolder.folder('presenter');
        if (presenterAdapterFolder) presenterAdapterFolder.file('README.md', '## Presenter Adapters');

        const repositoryAdapterFolder = adapterFolder.folder('repository');
        if (repositoryAdapterFolder) repositoryAdapterFolder.file('README.md', '## Repository Implementations');
    }

    if (infrastructureFolder) {
        infrastructureFolder.file('README.md', '## Infrastructure Layer');
    }

    zip.file('README.md', `# ${projectName || 'My Clean Architecture Project'}\n\nThis is a project generated with a basic Clean Architecture structure in ${language}.`);

    const content = await zip.generateAsync({ type: 'uint8array' });

    return new NextResponse(content, {
        status: 200,
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${projectName?.length ? projectName : 'project'}.zip"`,
        },
    });
}

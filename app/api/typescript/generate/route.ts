import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// プリミティブ型の定義
const PRIMITIVE_TYPES = ['string', 'number', 'boolean', 'Date', 'Array', 'Map', 'Set', 'any'];

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
const presenterTemplate = loadTemplate('ts/adapter/presenter.hbs');
const repositoryNoSqlTemplate = loadTemplate('ts/adapter/repository_nosql.hbs');
const repositorySqlTemplate = loadTemplate('ts/adapter/repository_sql.hbs');
const noSqlTemplate = loadTemplate('ts/adapter/nosql.hbs');
const sqlTemplate = loadTemplate('ts/adapter/sql.hbs');
const noSqlInfrastructureTemplate = loadTemplate('ts/infrastructure/nosql.hbs');
const sqlInfrastructureTemplate = loadTemplate('ts/infrastructure/sql.hbs');
const domainServiceImplTemplate = loadTemplate('ts/infrastructure/domain_service_impl.hbs');
const entityImplTemplate = loadTemplate('ts/infrastructure/entity_impl.hbs');
const valueObjectImplTemplate = loadTemplate('ts/infrastructure/valueObject.hbs');

// リポジトリのメソッド定義
const createRepositoryMethods = (domainName: string, varName: string) => [
    {
        name: 'findById',
        inputs: ['id: string'],
        output: `${domainName} | null`
    },
    {
        name: 'save',
        inputs: [`${varName}: ${domainName}`],
        output: 'void'
    },
    {
        name: 'delete',
        inputs: ['id: string'],
        output: 'void'
    },
    {
        name: 'exists',
        inputs: ['id: string'],
        output: 'boolean'
    }
];

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
        .filter(dep => !PRIMITIVE_TYPES.includes(dep))
        .map(dep => ({
            name: dep.charAt(0).toUpperCase() + dep.slice(1),
            from: `./${dep.charAt(0).toLowerCase() + dep.slice(1)}`
        }));

    const propertiesData = domain.attributes.map((attr: any) => ({
        name: attr.name,
        type: PRIMITIVE_TYPES.includes(attr.type.toLowerCase()) 
            ? attr.type.toLowerCase() 
            : attr.type.charAt(0).toUpperCase() + attr.type.slice(1),
    }));

    const methodsData = domain.methods.map((method: any) => ({
        name: method.name,
        inputs: method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string) => 
            PRIMITIVE_TYPES.includes(type.toLowerCase())
                ? type.toLowerCase()
                : type.charAt(0).toUpperCase() + type.slice(1)
        ),
        output: method.output.trim().toLowerCase() === 'string' || 
                method.output.trim().toLowerCase() === 'number' || 
                method.output.trim().toLowerCase() === 'boolean' || 
                method.output.trim().toLowerCase() === 'date' || 
                method.output.trim().toLowerCase() === 'array' || 
                method.output.trim().toLowerCase() === 'map' || 
                method.output.trim().toLowerCase() === 'set' || 
                method.output.trim().toLowerCase() === 'any'
            ? method.output.trim().toLowerCase()
            : method.output.trim().charAt(0).toUpperCase() + method.output.trim().slice(1),
    }));

    const templateData = {
        name: domain.name.charAt(0).toUpperCase() + domain.name.slice(1),
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
    const domainName = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
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
        imports: imports,
        methods: createRepositoryMethods(domainName, varName)
    };

    return repositoryTemplate(templateData);
};

const generateUsecaseContent = (usecase: any, allDomains: any[], language: string): string => {
    const usecaseName = usecase.name.charAt(0).toUpperCase() + usecase.name.slice(1);
    const inputInterfaceName = `${usecaseName}Input`;
    const outputInterfaceName = `${usecaseName}Output`;
    const usecaseInterfaceName = `I${usecaseName}UseCase`;
    const interactorName = `${usecaseName}Interactor`;

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
        .filter(type => !PRIMITIVE_TYPES.includes(type)) // primitive除外
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
            name: `${usecaseName}Presenter`,
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
            name: `create${usecaseName}UseCase`,
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
    const projectFolder = zip.folder(projectName || 'project');
    const domainFolder = projectFolder?.folder('domain');
    const usecaseFolder = projectFolder?.folder('usecase');
    const adapterFolder = projectFolder?.folder('adapter');
    const infrastructureFolder = projectFolder?.folder('infrastructure');

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
    }

    // Presenterファイルを生成してadapter/presenterフォルダに追加
    const presenterAdapterFolder = adapterFolder ? adapterFolder.folder('presenter') : null;
    if (presenterAdapterFolder) {
        usecases.forEach((usecase: any) => {
            const presenterFileName = `${usecase.name}Presenter.ts`;
            // Presenterテンプレートに渡すデータを生成
            const outputFields = (usecase.outputFields || []).map((f: any) => f.name);
            const presenterInputType = outputFields.length === 1 ? outputFields[0].charAt(0).toUpperCase() + outputFields[0].slice(1) : `${usecase.name}Output`;
            const presenterInputArg = outputFields.length === 1 ? outputFields[0].charAt(0).toLowerCase() + outputFields[0].slice(1) : 'output';

            // インポート情報の生成
            const imports = [];
            // ユースケースのOutput Interfaceをインポート
            imports.push({
                name: `${usecase.name}Output`,
                from: `../../usecase/${usecase.name}UseCase`
            });
            imports.push({
                name: `${usecase.name}Presenter`,
                from: `../../usecase/${usecase.name}UseCase`
            });
            // Outputでドメインオブジェクトを使用している場合、それをインポート
            if (outputFields.length === 1) {
                 const domainTypeName = outputFields[0].charAt(0).toUpperCase() + outputFields[0].slice(1);
                 const domainFileName = outputFields[0].charAt(0).toLowerCase() + outputFields[0].slice(1);
                 imports.push({
                     name: domainTypeName,
                     from: `../../domain/${domainFileName}`
                 });
            }

            const templateData = {
                className: `${usecase.name}PresenterDefault`,
                interfaceName: `${usecase.name}Presenter`,
                methodArg: presenterInputArg,
                argType: presenterInputType,
                returnType: `${usecase.name}Output`,
                imports: imports,
            };
            presenterAdapterFolder.file(presenterFileName, presenterTemplate(templateData));
        });
    }

    if (adapterFolder) {
        const repositoryAdapterFolder = adapterFolder.folder('repository');
        if (repositoryAdapterFolder) {
            // NoSQLとSQLのデータベース接続クラスを生成
            repositoryAdapterFolder.file('NoSQL.ts', noSqlTemplate({}));
            repositoryAdapterFolder.file('SQL.ts', sqlTemplate({}));

            domains.forEach((domain: any) => {
                if (domain.domainType === 'entity') {
                    const domainName = domain.name;
                    const varName = domainName.charAt(0).toLowerCase() + domainName.slice(1);
                    
                    // NoSQLリポジトリの実装
                    const noSqlTemplateData = {
                        name: domainName,
                        methods: createRepositoryMethods(domainName, varName),
                        imports: [
                            {
                                name: domainName,
                                from: `../../domain/${varName}`
                            },
                            {
                                name: `${domainName}Repository`,
                                from: `../../domain/${varName}Repository`
                            },
                            {
                                name: 'NoSQL',
                                from: './NoSQL'
                            }
                        ]
                    };
                    repositoryAdapterFolder.file(`${domainName}NoSqlRepository.ts`, repositoryNoSqlTemplate(noSqlTemplateData));

                    // SQLリポジトリの実装
                    const sqlTemplateData = {
                        name: domainName,
                        methods: createRepositoryMethods(domainName, varName),
                        imports: [
                            {
                                name: domainName,
                                from: `../../domain/${varName}`
                            },
                            {
                                name: `${domainName}Repository`,
                                from: `../../domain/${varName}Repository`
                            },
                            {
                                name: 'SQL',
                                from: './SQL'
                            }
                        ]
                    };
                    repositoryAdapterFolder.file(`${domainName}SqlRepository.ts`, repositorySqlTemplate(sqlTemplateData));
                }
            });
        }
    }

    if (infrastructureFolder) {
        // domainフォルダの作成
        const domainFolder = infrastructureFolder.folder('domain');
        if (domainFolder) {
            
            // ドメインオブジェクトの実装を生成
            domains.forEach((domain: any) => {
                const domainName = domain.name;
                const varName = domainName.charAt(0).toLowerCase() + domainName.slice(1);
                
                if (domain.domainType === 'entity') {
                    // 依存関係の収集
                    const dependencies = new Set<string>();
                    domain.attributes.forEach((attr: any) => {
                        if (!PRIMITIVE_TYPES.includes(attr.type)) {
                            dependencies.add(attr.type);
                        }
                    });
                    domain.methods.forEach((method: any) => {
                        const inputTypes = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
                        inputTypes.forEach((type: string) => {
                            if (!PRIMITIVE_TYPES.includes(type)) {
                                dependencies.add(type);
                            }
                        });
                        if (!PRIMITIVE_TYPES.includes(method.output.trim())) {
                            dependencies.add(method.output.trim());
                        }
                    });

                    const entityImplData = {
                        name: domainName,
                        imports: [
                            {
                                name: domainName,
                                from: `../../domain/${varName}`
                            },
                            ...Array.from(dependencies).map(dep => ({
                                name: dep.charAt(0).toUpperCase() + dep.slice(1),
                                from: `../../domain/${dep.charAt(0).toLowerCase() + dep.slice(1)}`
                            }))
                        ],
                        properties: domain.attributes.map((attr: any) => ({
                            name: attr.name,
                            type: PRIMITIVE_TYPES.includes(attr.type.toLowerCase()) 
                                ? attr.type.toLowerCase() 
                                : attr.type.charAt(0).toUpperCase() + attr.type.slice(1)
                        })),
                        methods: domain.methods.map((method: any) => ({
                            name: method.name,
                            inputs: method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string) => 
                                PRIMITIVE_TYPES.includes(type.toLowerCase())
                                    ? type.toLowerCase()
                                    : type.charAt(0).toUpperCase() + type.slice(1)
                            ),
                            output: PRIMITIVE_TYPES.includes(method.output.trim().toLowerCase())
                                ? method.output.trim().toLowerCase()
                                : method.output.trim().charAt(0).toUpperCase() + method.output.trim().slice(1)
                        }))
                    };
                    domainFolder.file(`${domainName}.ts`, entityImplTemplate(entityImplData));
                } else if (domain.domainType === 'valueObject') {
                    // 依存関係の収集
                    const dependencies = new Set<string>();
                    domain.attributes.forEach((attr: any) => {
                        if (!PRIMITIVE_TYPES.includes(attr.type)) {
                            dependencies.add(attr.type);
                        }
                    });

                    const valueObjectImplData = {
                        name: domainName,
                        imports: [
                            {
                                name: domainName,
                                from: `../../domain/${varName}`
                            },
                            ...Array.from(dependencies).map(dep => ({
                                name: dep.charAt(0).toUpperCase() + dep.slice(1),
                                from: `../../domain/${dep.charAt(0).toLowerCase() + dep.slice(1)}`
                            }))
                        ],
                        properties: domain.attributes.map((attr: any) => ({
                            name: attr.name,
                            type: PRIMITIVE_TYPES.includes(attr.type.toLowerCase()) 
                                ? attr.type.toLowerCase() 
                                : attr.type.charAt(0).toUpperCase() + attr.type.slice(1)
                        }))
                    };
                    domainFolder.file(`${domainName}.ts`, valueObjectImplTemplate(valueObjectImplData));
                } else if (domain.domainType === 'domainService') {
                    // 依存関係の収集
                    const dependencies = new Set<string>();
                    domain.methods.forEach((method: any) => {
                        const inputTypes = method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
                        inputTypes.forEach((type: string) => {
                            if (!PRIMITIVE_TYPES.includes(type)) {
                                dependencies.add(type);
                            }
                        });
                        if (!PRIMITIVE_TYPES.includes(method.output.trim())) {
                            dependencies.add(method.output.trim());
                        }
                    });

                    const domainServiceImplData = {
                        name: domainName,
                        imports: [
                            {
                                name: domainName,
                                from: `../../domain/${varName}`
                            },
                            ...Array.from(dependencies).map(dep => ({
                                name: dep.charAt(0).toUpperCase() + dep.slice(1),
                                from: `../../domain/${dep.charAt(0).toLowerCase() + dep.slice(1)}`
                            }))
                        ],
                        methods: domain.methods.map((method: any) => ({
                            name: method.name,
                            inputs: method.inputs.split(',').map((s: string) => s.trim()).filter(Boolean).map((type: string) => 
                                PRIMITIVE_TYPES.includes(type.toLowerCase())
                                    ? type.toLowerCase()
                                    : type.charAt(0).toUpperCase() + type.slice(1)
                            ),
                            output: PRIMITIVE_TYPES.includes(method.output.trim().toLowerCase())
                                ? method.output.trim().toLowerCase()
                                : method.output.trim().charAt(0).toUpperCase() + method.output.trim().slice(1)
                        }))
                    };
                    domainFolder.file(`${domainName}.ts`, domainServiceImplTemplate(domainServiceImplData));
                }
            });
        }

        // databaseフォルダの作成
        const databaseFolder = infrastructureFolder.folder('database');
        if (databaseFolder) {
            // NoSQLとSQLのデータベース接続クラスを生成
            databaseFolder.file('NoSQL.ts', noSqlInfrastructureTemplate({}));
            databaseFolder.file('SQL.ts', sqlInfrastructureTemplate({}));
        }

        // routerフォルダの作成
        const routerFolder = infrastructureFolder.folder('router');
    }


    const content = await zip.generateAsync({ type: 'uint8array' });

    return new NextResponse(content, {
        status: 200,
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${projectName?.length ? projectName : 'project'}.zip"`,
        },
    });
}

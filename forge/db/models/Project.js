/**
 * A Project
 * @namespace forge.db.models.Project
 * // type helpers for design time help and error checking
 * @typedef {import('sequelize').Model} Model
 * @typedef {import('sequelize').ModelAttributes} ModelAttributes
 * @typedef {import('sequelize').SchemaOptions} SchemaOptions
 * @typedef {import('sequelize').ModelIndexesOptions} ModelIndexesOptions
 * @typedef {import('sequelize').InitOptions} InitOptions
 * @typedef {import('sequelize').ModelScopeOptions} ModelScopeOptions
 * @typedef {{name: string, schema: ModelAttributes, model: Model, indexes?: ModelIndexesOptions[], scopes?: ModelScopeOptions, options?: InitOptions}} FFModel
 */

const { DataTypes } = require('sequelize')
const Controllers = require('../controllers')

/** @type {FFModel} */
module.exports = {
    name: 'Project',
    schema: {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            set (value) {
                this.setDataValue('safeName', value?.toLowerCase())
                this.setDataValue('name', value)
            }
        },
        type: { type: DataTypes.STRING, allowNull: false },
        url: {
            type: DataTypes.STRING,
            allowNull: false,
            get () {
                const originalUrl = this.getDataValue('url')?.replace(/\/$/, '') || ''
                let httpAdminRoot = this.ProjectSettings?.[0]?.value.httpAdminRoot
                if (httpAdminRoot === undefined) {
                    httpAdminRoot = this.ProjectTemplate?.settings?.httpAdminRoot
                }
                if (httpAdminRoot) {
                    if (httpAdminRoot[0] !== '/') {
                        httpAdminRoot = `/${httpAdminRoot}`
                    }
                    return originalUrl + httpAdminRoot
                } else {
                    return originalUrl
                }
            }
        },
        slug: { type: DataTypes.VIRTUAL, get () { return this.id } },
        state: { type: DataTypes.STRING, allowNull: false, defaultValue: 'running' },
        links: {
            type: DataTypes.VIRTUAL,
            get () {
                return {
                    self: process.env.FLOWFORGE_BASE_URL + '/api/v1/projects/' + this.id
                }
            }
        },
        storageURL: { type: DataTypes.VIRTUAL, get () { return process.env.FLOWFORGE_API_URL + '/storage' } },
        auditURL: { type: DataTypes.VIRTUAL, get () { return process.env.FLOWFORGE_API_URL + '/logging' } },
        safeName: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
            get () {
                return this.getDataValue('safeName') || this.getDataValue('name')?.toLowerCase()
            }
        }
    },
    indexes: [
        { name: 'projects_safe_name_unique', fields: ['safeName'], unique: true }
    ],
    associations: function (M) {
        this.belongsTo(M.Team)
        this.hasOne(M.AuthClient, {
            foreignKey: 'ownerId',
            constraints: false,
            scope: {
                ownerType: 'project'
            }
        })
        this.hasOne(M.AccessToken, {
            foreignKey: 'ownerId',
            constraints: false,
            scope: {
                ownerType: 'project'
            }
        })
        this.hasMany(M.ProjectSettings)
        this.belongsTo(M.ProjectType)
        this.belongsTo(M.ProjectStack)
        this.belongsTo(M.ProjectTemplate)
        this.hasMany(M.ProjectSnapshot)
    },
    hooks: function (M, app) {
        return {
            beforeCreate: async (project, opts) => {
                const projectLimit = app.license.get('projects')
                const projectCount = await M.Project.count()
                if (projectCount >= projectLimit) {
                    throw new Error('license limit reached')
                }
            },
            afterDestroy: async (project, opts) => {
                await M.AccessToken.destroy({
                    where: {
                        ownerType: 'project',
                        ownerId: project.id
                    }
                })
                await M.AuthClient.destroy({
                    where: {
                        ownerType: 'project',
                        ownerId: project.id
                    }
                })
                await M.BrokerClient.destroy({
                    where: {
                        ownerType: 'project',
                        ownerId: project.id
                    }
                })
                await M.ProjectSettings.destroy({
                    where: {
                        ProjectId: project.id
                    }
                })
                await M.StorageLibrary.destroy({
                    where: {
                        ProjectId: project.id
                    }
                })
                await M.StorageSettings.destroy({
                    where: {
                        ProjectId: project.id
                    }
                })
                await M.StorageSession.destroy({
                    where: {
                        ProjectId: project.id
                    }
                })
                await M.StorageCredentials.destroy({
                    where: {
                        ProjectId: project.id
                    }
                })
                await M.StorageFlow.destroy({
                    where: {
                        ProjectId: project.id
                    }
                })
            }
        }
    },
    finders: function (M) {
        return {
            instance: {
                async refreshAuthTokens () {
                    const authClient = await Controllers.AuthClient.createClientForProject(this)
                    const projectToken = await Controllers.AccessToken.createTokenForProject(this, null)
                    const projectBrokerCredentials = await Controllers.BrokerClient.createClientForProject(this)
                    return {
                        token: projectToken.token,
                        ...authClient,
                        broker: projectBrokerCredentials
                    }
                },
                async getAllSettings () {
                    const result = {}
                    const settings = await this.getProjectSettings()
                    settings.forEach(setting => {
                        result[setting.key] = setting.value
                    })
                    result.settings = result.settings || {}
                    result.settings.env = Controllers.Project.insertPlatformSpecificEnvVars(this, result.settings.env) // add platform specific device env vars
                    return result
                },
                async updateSettings (obj, options) {
                    const updates = []
                    for (const [key, value] of Object.entries(obj)) {
                        if (key === 'settings' && value && Array.isArray(value.env)) {
                            value.env = Controllers.Project.removePlatformSpecificEnvVars(value.env) // remove platform specific values
                        }
                        updates.push({ ProjectId: this.id, key, value })
                    }
                    options = options || {}
                    options.updateOnDuplicate = ['value']
                    await M.ProjectSettings.bulkCreate(updates, options)
                },
                async updateSetting (key, value, options) {
                    if (key === 'settings' && value && Array.isArray(value.env)) {
                        value.env = Controllers.Project.removePlatformSpecificEnvVars(value.env) // remove platform specific values
                    }
                    return await M.ProjectSettings.upsert({ ProjectId: this.id, key, value }, options)
                },
                async getSetting (key) {
                    const result = await M.ProjectSettings.findOne({ where: { ProjectId: this.id, key } })
                    if (result) {
                        if (key === 'settings') {
                            result.value = result.value || {}
                            result.value.env = Controllers.Project.insertPlatformSpecificEnvVars(this, result.value.env)
                        }
                        return result.value
                    }
                    return undefined
                },

                async getCredentialSecret () {
                    // If this project was created at 0.6+ but then started with a <0.6 launcher
                    // (for example, in k8s with an old stack) then the project will have both
                    // StorageSettings._credentialSecret *AND* ProjectSettings.credentialSecret
                    // If both are present, we *must* use _credentialSecret as that is what
                    // the runtime is using

                    let credentialSecret = await this.getSetting('credentialSecret')
                    if (!credentialSecret) {
                        // Older project - check the StorageSettings to see if
                        // the runtime has generated one
                        const storageSettings = await M.StorageSettings.byProject(this.id)
                        if (storageSettings && storageSettings.settings) {
                            try {
                                const projectSettings = JSON.parse(storageSettings.settings)
                                credentialSecret = projectSettings._credentialSecret
                            } catch (err) {
                            }
                        }
                    }
                    return credentialSecret
                }
            },
            static: {
                isNameUsed: async (name) => {
                    const safeName = name?.toLowerCase()
                    const count = await this.count({
                        where: { safeName }
                    })
                    return count !== 0
                },
                byUser: async (user) => {
                    return this.findAll({
                        include: {
                            model: M.Team,
                            include: [
                                {
                                    model: M.TeamMember,
                                    where: {
                                        UserId: user.id
                                    }
                                },
                                {
                                    model: M.ProjectType,
                                    attributes: ['hashid', 'id', 'name']
                                },
                                {
                                    model: M.ProjectStack
                                },
                                {
                                    model: M.ProjectTemplate,
                                    attributes: ['hashid', 'id', 'name', 'links']
                                }
                            ],
                            required: true
                        }
                    })
                },
                byId: async (id) => {
                    return this.findOne({
                        where: { id },
                        include: [
                            {
                                model: M.Team,
                                attributes: ['hashid', 'id', 'name', 'slug', 'links']
                            },
                            {
                                model: M.ProjectType,
                                attributes: ['hashid', 'id', 'name']
                            },
                            {
                                model: M.ProjectStack,
                                attributes: ['hashid', 'id', 'name', 'label', 'links', 'properties', 'replacedBy', 'ProjectTypeId']
                            },
                            {
                                model: M.ProjectTemplate,
                                attributes: ['hashid', 'id', 'name', 'links', 'settings', 'policy']
                            },
                            {
                                model: M.ProjectSettings,
                                where: { key: 'settings' },
                                required: false
                            }
                        ]
                    })
                },
                byTeam: async (teamHashId) => {
                    const teamId = M.Team.decodeHashid(teamHashId)
                    return this.findAll({
                        include: [
                            {
                                model: M.Team,
                                where: { id: teamId },
                                attributes: ['hashid', 'id', 'name', 'slug', 'links']
                            },
                            {
                                model: M.ProjectType,
                                attributes: ['hashid', 'id', 'name']
                            },
                            {
                                model: M.ProjectStack
                            },
                            {
                                model: M.ProjectTemplate,
                                attributes: ['hashid', 'id', 'name', 'links']
                            }
                        ]
                    })
                },
                getProjectTeamId: async (id) => {
                    const project = await this.findOne({
                        where: { id },
                        attributes: [
                            'TeamId'
                        ]
                    })
                    if (project) {
                        return project.TeamId
                    }
                }
            }
        }
    }
}

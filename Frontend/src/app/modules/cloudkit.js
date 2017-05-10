import config from 'config'
import { serializeSteps, deserializeSteps } from './stephandling'

class CloudKit {
  constructor () {
    this.router = {}
    this.vm = {}

    this.user = {}

    this.scholar = {}
    this.scholarSocialMedia = {}
  }

  async init () {
    this.ck = window.CloudKit

    this.ck.configure({
      containers: [{
        containerIdentifier: config.cloudKit.containerIdentifier,
        apiTokenAuth: {
          apiToken: config.cloudKit.apiToken,
          persist: true
        },
        environment: config.cloudKit.environment
      }]
    })

    this.defaultContainer = this.ck.getDefaultContainer()
    this.publicDatabase = this.defaultContainer.getDatabaseWithDatabaseScope(
      this.ck.DatabaseScope['PUBLIC']
    )
    this._setupAuth()
  }

  _handleError (error) {
    this.Raven.captureException(error)
    this.router.replace({ name: 'error' })
  }

  async _setupAuth () {
    this.defaultContainer.setUpAuth()
      .then(async userIdentity => {
        try {
          if (userIdentity) {
            this.user = userIdentity
            await this._gotoAuthenticatedState(userIdentity)
          } else {
            await this._gotoUnauthenticatedState()
          }
        } catch (error) {
          this._handleError(error)
        }
      })
  }

  async _gotoAuthenticatedState (userIdentity) {
    this.Raven.captureBreadcrumb({
      message: 'gotoAuthenticatedState',
      category: 'CloudKit',
      data: { userIdentity }
    })
    this.user.isAuthenticated = true
    this.Raven.setUserContext({
      id: userIdentity.userRecordName
    })

    this.defaultContainer
      .whenUserSignsOut()
      .then(this._gotoUnauthenticatedState.bind(this))

    let userRecord = await this.fetchFirstRecord(userIdentity.userRecordName)
    if (!userRecord) {
      return
    }
    let scholarReference = userRecord.fields.scholar

    if (!scholarReference) {
      // Scholar isn't linked yet or doesn't exist at all
      this.router.push({ name: 'link' })
      return
    }

    // Else: Scholar link already existing, fetch scholar
    let scholarRecord = await this.fetchFirstRecord(scholarReference.value.recordName)

    this.scholar = scholarRecord
    this.Raven.setUserContext({
      id: userIdentity.userRecordName,
      email: scholarRecord.fields.email.value
    })

    await this.evaluateCompletionStatus(scholarRecord)
  }

  async _gotoUnauthenticatedState (error) {
    // console.log('gotoUnauthenticatedState')
    this.Raven.captureBreadcrumb({
      message: 'gotoAuthenticatedState',
      category: 'CloudKit'
    })
    if (error /* && error.ckErrorCode === 'AUTH_PERSIST_ERROR' */) {
      throw error
    }

    this.user = {}

    this.defaultContainer
      .whenUserSignsIn()
      .then(this._gotoAuthenticatedState.bind(this))
      .catch(this._gotoUnauthenticatedState.bind(this))

    this.Raven.setUserContext()
    this.router.replace({ name: 'signin' })
  }

  async submitModel (model) {
    let fields = serializeSteps(model)

    this.Raven.setUserContext({
      id: this.user.userRecordName,
      email: fields.scholar.email
    })

    let [wwdcYearInfoRecord, socialMediaRecord] = await Promise.all([
      this._save('WWDCYearInfo', fields.wwdcYearInfo),
      this._save(
        'ScholarSocialMedia',
        fields.socialMedia,
        this.scholarSocialMedia.recordName,
        this.scholarSocialMedia.recordChangeTag
      )
    ])

    if (!wwdcYearInfoRecord || !socialMediaRecord) {
      return
    }

    fields.scholar.socialMedia = {
      recordName: socialMediaRecord.recordName,
      action: 'DELETE_SELF'
    }

    if (this.scholar.fields) {
      fields.scholar.wwdcYearInfos = this.scholar.fields.wwdcYearInfos.value
      fields.scholar.wwdcYears = this.scholar.fields.wwdcYears.value
    } else {
      fields.scholar.wwdcYearInfos = []
      fields.scholar.wwdcYears = []
    }
    fields.scholar.wwdcYearInfos.push({
      recordName: wwdcYearInfoRecord.recordName,
      action: 'DELETE_SELF'
    })
    fields.scholar.wwdcYears.push({
      recordName: config.wwdcYear,
      action: 'NONE'
    })

    // Save the scholar
    let scholar = await this._save(
      'Scholar',
      fields.scholar,
      this.scholar.recordName,
      this.scholar.recordChangeTag
    )
    if (!scholar) {
      return
    }

    // Cross reference for WWDCYearInfo
    await this._save(
      'WWDCYearInfo', {
        scholar: { recordName: scholar.recordName, action: 'DELETE_SELF' },
        year: { recordName: config.wwdcYear, action: 'NONE' }
      },
      wwdcYearInfoRecord.recordName,
      wwdcYearInfoRecord.recordChangeTag
    )
    // Cross reference for ScholarSocialMedia
    await this._save(
      'ScholarSocialMedia', {
        scholar: { recordName: scholar.recordName, action: 'DELETE_SELF' }
      },
      socialMediaRecord.recordName,
      socialMediaRecord.recordChangeTag
    )

    if (!this.user.userRecordName) {
      let userIdentity = await this.fetchCurrentUserIdentity()
      this.user = userIdentity
      this.user.isAuthenticated = true
    }
    let userRecord = await this.fetchFirstRecord(this.user.userRecordName)
    if (!userRecord) {
      return
    }
    await this._linkScholar(userRecord, scholar)

    return scholar
  }

  async _save (recordType, fields, recordName, recordChangeTag) {
    let response = await this._saveRecord('PUBLIC', recordName, recordChangeTag, recordType, null, null, null, null, null, null, null, fields, null)
    if (!response.records[0]) {
      throw new Error('Empty response when saving record: ' + recordName)
    }

    return response.records[0]
  }

  async fetchCurrentUserIdentity () {
    return this.defaultContainer.fetchCurrentUserIdentity()
  }

  async evaluateCompletionStatus (scholarRecord) {
    let wwdcYears = scholarRecord.fields.wwdcYears.value

    // Check if the user already submitted the current batch
    for (var i = 0; i < wwdcYears.length; i++) {
      if (wwdcYears[i].recordName === config.wwdcYear) {
        console.log('Contains ' + config.wwdcYear + ', going to ThankYou')
        this.router.push({ name: 'thankyou' })
        return
      }
    }

    // Scholar exists but hasn't filled this years form
    // Fetch social media
    let socialMediaReference = scholarRecord.fields.socialMedia
    let socialMediaRecord = await this.fetchFirstRecord(socialMediaReference.value.recordName)
    if (!socialMediaRecord) {
      return
    }

    this.scholarSocialMedia = socialMediaRecord

    deserializeSteps(this.vm.$store.steps, scholarRecord.fields, socialMediaRecord.fields)

    this.router.replace({ name: 'welcome' })
  }

  async linkScholarByEmail (email) {
    let scholarRecord = await this.findScholarByEmail(email)
    if (!scholarRecord) {
      return
    }
    await this.linkScholar(scholarRecord)
  }

  async linkScholar (scholarRecord) {
    if (!scholarRecord) { return }

    this.scholar = scholarRecord

    if (!this.user.userRecordName) {
      let userIdentity = await this.fetchCurrentUserIdentity()
      if (!userIdentity) { return }
      this.user = userIdentity
      this.user.isAuthenticated = true
    }
    let userRecord = await this.fetchFirstRecord(this.user.userRecordName)
    if (!userRecord) {
      return
    }

    await this._linkScholar(userRecord, scholarRecord)
    this.Raven.setUserContext({
      id: userRecord.userRecordName,
      email: scholarRecord.fields.email.value
    })

    await this.evaluateCompletionStatus(scholarRecord)
  }

  async _linkScholar (userRecord, scholar) {
    this.Raven.captureBreadcrumb({
      message: '_linkScholar',
      category: 'CloudKit',
      data: { userRecord, scholarRecord: scholar }
    })
    let fields = {
      scholar: {
        recordName: scholar.recordName,
        action: 'NONE'
      }
    }

    return this._save('Users', fields, userRecord.recordName, userRecord.recordChangeTag)
  }

  async fetchFirstRecord (recordName) {
    this.Raven.captureBreadcrumb({
      message: 'fetchFirstRecord',
      category: 'CloudKit',
      data: { recordName }
    })
    let response = await this._fetchRecord(recordName)
    if (!response.records[0]) {
      throw new Error('Empty response when fetching record: ' + recordName)
    }

    return response.records[0]
  }

  _fetchRecord (recordName) {
    return this._promisify(
      this.publicDatabase.fetchRecords(recordName)
    )
  }

  async findScholarByEmail (email) {
    let response = await this._performQuery({
      recordType: 'Scholar',
      filterBy: [{
        comparator: 'EQUALS',
        fieldName: 'email',
        fieldValue: { value: email }
      }]
    }, {
      // desiredKeys: ['recordName', 'recordChangeTag'],
      resultsLimit: 1
    })

    if (!response.records[0]) {
      throw new Error('Could not find scholar with email: ' + email)
    }

    return response.records[0]
  }

  _performQuery (query, options) {
    return this._promisify(
      this.publicDatabase.performQuery(query, options)
    )
  }

  _saveRecord (databaseScope, recordName, recordChangeTag, recordType, zoneName, forRecordName, forRecordChangeTag, publicPermission, ownerRecordName, participants, parentRecordName, fields, createShortGUID) {
    const options = {}

    // IF no zoneName is provided the record will be saved to the default zone.
    if (zoneName) {
      options.zoneID = { zoneName }
      if (ownerRecordName) {
        options.zoneID.ownerRecordName = ownerRecordName
      }
    }

    const record = {
      recordType
    }

    // If no recordName is supplied the server will generate one.
    if (recordName) {
      record.recordName = recordName
    }

    // To modify an existing record, supply a recordChangeTag.
    if (recordChangeTag) {
      record.recordChangeTag = recordChangeTag
    }

    // Convert the fields to the appropriate format
    record.fields = Object.keys(fields).reduce((obj, key) => {
      obj[key] = { value: fields[key] }
      return obj
    }, {})

    // If we are going to want to share the record we need to request a stable short GUID.
    if (createShortGUID) {
      record.createShortGUID = true
    }

    // If we want to share the record via a parent reference we need to set the record's parent property.
    if (parentRecordName) {
      record.parent = { recordName: parentRecordName }
    }

    if (publicPermission) {
      record.publicPermission = this.CloudKit.ShareParticipantPermission[publicPermission]
    }

    // If we are creating a share record, we must specify the record which we are sharing.
    if (forRecordName && forRecordChangeTag) {
      record.forRecord = {
        recordName: forRecordName,
        recordChangeTag: forRecordChangeTag
      }
    }

    if (participants) {
      record.participants = participants.map(function (participant) {
        return {
          userIdentity: {
            lookupInfo: { emailAddress: participant.emailAddress }
          },
          permission: this.CloudKit.ShareParticipantPermission[participant.permission],
          type: participant.type,
          acceptanceStatus: participant.acceptanceStatus
        }
      })
    }

    this.Raven.captureBreadcrumb({
      message: 'saveRecord',
      category: 'CloudKit',
      data: record
    })

    return this._promisify(
      this.publicDatabase.saveRecords(record, options)
    )
  }

  _promisify (ckPromise) {
    return new Promise((resolve, reject) => {
      ckPromise.then((response) => {
        if (response.hasErrors) {
          this.Raven.captureBreadcrumb({
            message: 'Error',
            category: 'CloudKit',
            data: response
          })
          return reject(response.errors)
        }

        resolve(response)
      })
    })
  }
}

export default CloudKit
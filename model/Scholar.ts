import { CloudKit, Record, WWDCYearInfo, Field } from '.'

export type Gender = ('male' | 'female' | 'other')

export default class Scholar extends Record {
  static recordType = 'Scholar'

  @Field public givenName!: string
  @Field public familyName!: string
  @Field public gender!: Gender
  @Field public birthday?: number
  @Field public location!: CloudKit.Location
  @Field public biography!: string
  @Field public profilePicture!: CloudKit.Asset
  @Field public scholarPrivate!: CloudKit.Reference
  @Field public socialMedia!: CloudKit.Reference
  @Field public wwdcYearInfos!: CloudKit.Reference[]
  @Field public wwdcYears!: CloudKit.Reference[]
  @Field public wwdcYearsApproved!: CloudKit.Reference[]
  @Field public gdprConsentAt?: number

  public yearInfos: { [year: string]: WWDCYearInfo } = {}
  public socials: { [service: string]: string } = {}
}

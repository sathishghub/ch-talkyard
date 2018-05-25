/**
 * Copyright (C) 2012, 2014 Kaj Magnus Lindberg (born 1979)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package debiki

import akka.actor._
import org.apache.commons.{mail => acm}
import com.debiki.core._
import com.debiki.core.Prelude._
import debiki.dao.SiteDao
import debiki.dao.SiteDaoFactory
import play.{api => p}
import scala.collection.mutable
import scala.concurrent.Promise


object Mailer {


  /** Starts a single email sending actor.
    *
    * If no email settings have been configured, uses an actor that doesn't send any
    * emails but instead logs them to the console.
    *
    * BUG: SHOULD terminate it before shutdown, in a manner that
    * doesn't accidentally forget forever to send some emails.
    * (Also se Notifier.scala)
    */
  def startNewActor(actorSystem: ActorSystem, daoFactory: SiteDaoFactory, config: p.Configuration,
        now: () => When): ActorRef = {

    // ----- Read in config

    val anySmtpServerName = config.getString("talkyard.smtp.host").orElse(
      config.getString("talkyard.smtp.server")).noneIfBlank // old deprecated name

    val anySmtpPort = config.getInt("talkyard.smtp.port")
    val anySmtpTlsPort = config.getInt("talkyard.smtp.tlsPort") orElse {
      // Depreacted name, because SSL is insecure and in fact disabled. [NOSSL]
      config.getInt("talkyard.smtp.sslPort")
    }
    val anySmtpUserName = config.getString("talkyard.smtp.user").noneIfBlank
    val anySmtpPassword = config.getString("talkyard.smtp.password").noneIfBlank
    val anyFromAddress = config.getString("talkyard.smtp.fromAddress").noneIfBlank
    val anyBounceAddress = config.getString("talkyard.smtp.bounceAddress").noneIfBlank
    val debug = config.getBoolean("talkyard.smtp.debug") getOrElse false

    // About STARTTLS and TLS/SSL and ports 25, 587, 465:
    // https://www.fastmail.com/help/technical/ssltlsstarttls.html
    // Current situation:
    // - STARTTLS on port 587 seems to be recommended (no SSL disallowed).
    // - But lots people connect via TLS/SSL on 465 so all servers supports that too.
    // - And outgoing port 25 often blocked, because of hacked servers that send spam.

    // This will use & require STARTTLS = starts in unencrypted plaintext on the smtp port
    // (typically 587, or, in the past, 25) and upgrades to tls.
    val requireStartTls = config.getBoolean("talkyard.smtp.requireStartTls") getOrElse false

    // This with instead start with TLS directly on the tls/ssl port (typically 465).
    // And maybe try using STARTTLS.
    val useTls = config.getBoolean("talkyard.smtp.useTls") orElse {
      // Deprecated name, because SSL is insecure and in fact disabled. [NOSSL]
      config.getBoolean("talkyard.smtp.useSslOrTls")
    } getOrElse true

    val enableStartTls =
      config.getBoolean("talkyard.smtp.enableStartTls").getOrElse(useTls || requireStartTls)

    val checkServerIdentity = config.getBoolean("talkyard.smtp.checkServerIdentity").getOrElse(
      useTls || requireStartTls)

    // ----- Config makes sense?

    var errorMessage = ""
    if (anySmtpServerName.isEmpty) errorMessage += " No talkyard.smtp.host configured."
    if (anySmtpUserName.isEmpty) errorMessage += " No talkyard.smtp.user configured."
    if (anySmtpPassword.isEmpty) errorMessage += " No talkyard.smtp.password configured."
    if (anyFromAddress.isEmpty) errorMessage += " No talkyard.smtp.fromAddress configured."

    if (anySmtpPort.isEmpty) {
      if (requireStartTls) {
        errorMessage += " talkyard.smtp.requireStartTls=true but no talkyard.smtp.port configured."
      }
      else if (!useTls) {
        errorMessage += " No talkyard.smtp.port configured."
      }
      else {
        // Then TLS and the TLS port is enough? Checked for just below.
      }
    }

    if (useTls && anySmtpTlsPort.isEmpty) {
      errorMessage += " No talkyard.smtp.tlsPort configured."
    }

    // ----- Create email actor

    val actorRef =
      if (errorMessage.nonEmpty) {
        p.Logger.info(s"I won't send emails, because: $errorMessage [TyEEMAILCONF]")
        actorSystem.actorOf(
          Props(new Mailer(
            daoFactory, now, serverName = "", port = None,
            tlsPort = None, useTls = false, requireStartTls = false,
            checkServerIdentity = false,
            userName = "", password = "", fromAddress = "", debug = debug,
            bounceAddress = None, broken = true)),
          name = s"BrokenMailerActor-$testInstanceCounter")
      }
      else {
        actorSystem.actorOf(
          Props(new Mailer(
            daoFactory,
            now,
            serverName = anySmtpServerName getOrDie "TyE3KPD78",
            port = anySmtpPort,
            tlsPort = anySmtpTlsPort,
            useTls = useTls,
            requireStartTls = requireStartTls,
            checkServerIdentity = checkServerIdentity,
            userName = anySmtpUserName getOrDie "TyE6KTQ20",
            password = anySmtpPassword getOrDie "TyE8UKTQ2",
            fromAddress = anyFromAddress getOrDie "TyE2QKJ93",
            debug = debug,
            bounceAddress = anyBounceAddress,
            broken = false)),
          name = s"MailerActor-$testInstanceCounter")
      }

    testInstanceCounter += 1
    actorRef
  }

  // Not thread safe; only needed in integration tests.
  private var testInstanceCounter = 1

}



/** Sends emails via SMTP. Does not handle any incoming mail. If broken, however,
  * then only logs emails to the console. It'll be broken e.g. if you run on localhost
  * with no SMTP settings configured — it'll still work for E2E tests though.
  *
  * In the past I was using Amazon AWS SES API, but now plain SMTP
  * is used instead. I removed the SES code in commit
  * 0489d88e on 2014-07-11: "Send emails via SMTP, not Amazon AWS' SES API."
  */
class Mailer(
  val daoFactory: SiteDaoFactory,
  val now: () => When,
  val serverName: String,
  val port: Option[Int],
  val tlsPort: Option[Int],
  val useTls: Boolean,
  val requireStartTls: Boolean,
  val checkServerIdentity: Boolean,
  val userName: String,
  val password: String,
  val fromAddress: String,
  val bounceAddress: Option[String],
  val debug: Boolean,
  val broken: Boolean) extends Actor {

  require(useTls || !requireStartTls, "requireTls is true but useSslOrTls is false [TyEREQTLS0TLS]")
  require(useTls || !checkServerIdentity,
    "checkServerIdentity is true but useSslOrTls is false [TyECHECKID0TLS]")

  private val logger = play.api.Logger("app.mailer")

  private val e2eTestEmails = mutable.HashMap[String, Promise[Vector[Email]]]()

  /**
   * Accepts an (Email, tenant-id), and then sends that email on behalf of
   * the tenant. The caller should already have saved the email to the
   * database (because Mailer doesn't know exactly how to save it, e.g.
   * if any other tables should also be updated).
   */
  def receive: PartialFunction[Any, Unit] = {
    case (email: Email, siteId: SiteId) =>
      sendEmail(email, siteId)
    case ("GetEndToEndTestEmail", siteIdColonEmailAddress: String) =>
      e2eTestEmails.get(siteIdColonEmailAddress) match {
        case Some(promise) =>
          sender() ! promise.future
        case None =>
          SECURITY // DoS attack: don't add infinitely many promises in prod mode
          CLEAN_UP // could stop using promises — let the e2e tests poll the server instead? (7KUDQY00) DONE now, on the next line. So dooo clean up.
          val newPromise = Promise[Vector[Email]]()
          newPromise.success(Vector.empty)
          e2eTestEmails.put(siteIdColonEmailAddress, newPromise)
          sender() ! newPromise.future
      }
    /*
    case Bounce/Rejection/Complaint/Other =>
     */
  }


  private def sendEmail(emailToSend: Email, siteId: SiteId) {

    val tenantDao = daoFactory.newSiteDao(siteId)

    // I often use @example.com, or simply @ex.com, when posting test comments
    // — don't send those emails, to keep down the bounce rate.
    if (broken || emailToSend.sentTo.endsWith("example.com") ||
        emailToSend.sentTo.endsWith("ex.com") ||
        emailToSend.sentTo.endsWith("x.co")) {
      fakeSendAndRememberForE2eTests(emailToSend, tenantDao)
      return
    }

    logger.debug(s"Sending email: $emailToSend")

    // Reload the user and his/her email address in case it's been changed recently.
    val address = emailToSend.toUserId.flatMap(tenantDao.getUser).map(_.email) getOrElse
      emailToSend.sentTo

    val emailWithAddress = emailToSend.copy(
      sentTo = address, sentOn = Some(now().toJavaDate), providerEmailId = None)
    val apacheCommonsEmail  = makeApacheCommonsEmail(emailWithAddress)
    val emailAfter =
      try {
        apacheCommonsEmail.send()
        // Nowadays not using Amazon's SES api, so no provider email id is available.
        logger.trace("Email sent [EdM72JHB4]: "+ emailWithAddress)
        emailWithAddress
      }
      catch {
        case ex: acm.EmailException =>
          var message = ex.getMessage
          if (ex.getCause ne null) {
            message += "\nCaused by: " + ex.getCause.getMessage
          }
          val badEmail = emailWithAddress.copy(failureText = Some(message))
          logger.warn(s"Error sending email [EdESEME001]: $badEmail")
          badEmail
      }

    tenantDao.updateSentEmail(emailAfter)
  }


  private def makeApacheCommonsEmail(email: Email): acm.HtmlEmail = {
    val apacheCommonsEmail = new acm.HtmlEmail()
    apacheCommonsEmail.setDebug(debug)
    apacheCommonsEmail.setHostName(serverName)
    port foreach apacheCommonsEmail.setSmtpPort
    tlsPort foreach (p => apacheCommonsEmail.setSslSmtpPort(p.toString))
    apacheCommonsEmail.setAuthenticator(new acm.DefaultAuthenticator(userName, password))

    // Apache Commons Email will try both TLS and SSL, although the function is named 'setSSL...'?
    // And since we've disabled SSL, TLS should get used? [NOSSL]
    apacheCommonsEmail.setSSLOnConnect(useTls)

    apacheCommonsEmail.setStartTLSEnabled(useTls || requireStartTls)
    apacheCommonsEmail.setStartTLSRequired(requireStartTls)

    apacheCommonsEmail.setSSLCheckServerIdentity(checkServerIdentity)

    apacheCommonsEmail.addTo(email.sentTo)
    apacheCommonsEmail.setFrom(fromAddress)
    bounceAddress foreach apacheCommonsEmail.setBounceAddress

    apacheCommonsEmail.setSubject(email.subject)
    apacheCommonsEmail.setHtmlMsg(email.bodyHtmlText)
    apacheCommonsEmail
  }


  /** Updates the database so it looks as if the email has been sent, plus makes the
    * email accessible to end-to-end tests.
    */
  def fakeSendAndRememberForE2eTests(email: Email, siteDao: SiteDao) {
    play.api.Logger.debug(i"""
      |Fake-sending email (only logging it to the console): [EsM6LK4J2]
      |————————————————————————————————————————————————————————————
      |$email
      |————————————————————————————————————————————————————————————
      |""")
    val emailSent = email.copy(sentOn = Some(now().toJavaDate))
    siteDao.updateSentEmail(emailSent)
    if (Email.isE2eTestEmailAddress(email.sentTo)) {
      rememberE2eTestEmail(email, siteDao)
    }
  }


  def rememberE2eTestEmail(email: Email, siteDao: SiteDao) {
    val siteIdColonEmailAddress = s"${siteDao.siteId}:${email.sentTo}"
    e2eTestEmails.get(siteIdColonEmailAddress) match {
      case Some(promise) =>
        if (promise.isCompleted) {
          p.Logger.debug(
              s"Appending e2e test email to: ${email.sentTo}, subject: ${email.subject} [DwM2PK3]")
          val oldEmails = promise.future.value.get.toOption getOrDie "EdE4FSBBK2"
          val moreEmails = oldEmails :+ email
          val lastTen = moreEmails.takeRight(10)
          e2eTestEmails.put(siteIdColonEmailAddress, Promise.successful(lastTen))
        }
        else {
          promise.success(Vector(email))
        }
      case None =>
        SECURITY // DoS attack: don't remember infinitely many addresses in prod mode
        // Solution:  (7KUDQY00) ?
        e2eTestEmails.put(siteIdColonEmailAddress, Promise.successful(Vector(email)))
    }
  }

}
